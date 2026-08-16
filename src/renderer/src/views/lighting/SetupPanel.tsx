import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useLightingStore } from '../../state/lightingStore'
import { BUILTIN_FIXTURES, fixturesById } from '@core/lighting/fixtures/library'
import { findAddressOverlaps, fixtureFootprint } from '@core/lighting/fixtures/types'
import type { OutputProtocol, Scene } from '@core/lighting/engine/types'
import { defaultSmartPools } from '@core/lighting/engine/presetScenes'
import { SceneEditorModal } from './SceneEditorModal'
import { FixtureLimitsModal } from './FixtureLimitsModal'
import { OutputDiagnostics } from './OutputDiagnostics'
import { SceneTile } from './SceneTile'
import { groupScenesByCategory } from './sceneCategories'
import { describeScene } from './sceneDescribe'
import { rigProfile, sceneCompatible } from './sceneCompat'
import { SetupSection, SetupViewContext, type SetupView } from './SetupSection'
import { FixtureIcon } from './FixtureIcons'
import { padColumns, resizePadArray } from './padGrid'
import { parsePadFunction, padFunctionInfo } from './padFunctions'
import { CustomFixtureEditor } from './CustomFixtureEditor'
import { parseFixtureImport, FIXTURE_AI_PROMPT } from '@core/lighting/fixtures/fixtureImport'
import { StageVisualizer } from './StageVisualizer'
import { AudioAnalyzer } from '../../audio/AudioAnalyzer'
import {
  audioAnalyzer,
  midiPads,
  onAudioFrame,
  onAudioStateChange,
  startAudioListening,
  stopAudioListening
} from './runtime'
import type { ControlAction, ControlKind, PadAction } from '../../midi/MidiPads'

const LEARNABLE_ACTIONS: { label: string; action: PadAction }[] = [
  ...Array.from({ length: 16 }, (_, i) => ({
    label: `Pad ${i + 1}`,
    action: { kind: 'pad', padIndex: i } as PadAction
  })),
  { label: 'Blackout', action: { kind: 'blackout' } },
  { label: 'Strobe (hold)', action: { kind: 'strobe' } },
  { label: 'Tap tempo', action: { kind: 'tap' } },
  { label: 'Resync beat 1', action: { kind: 'resync' } },
  { label: 'Autopilot on/off', action: { kind: 'autopilot' } },
  { label: 'Manual trigger', action: { kind: 'manual' } }
]

/** Continuous controls a MIDI knob or fader can drive. */
const LEARNABLE_CONTROLS: { label: string; action: ControlAction }[] = [
  { label: 'Master brightness', action: { kind: 'masterDimmer' } },
  { label: 'Pan (left/right)', action: { kind: 'pan' } },
  { label: 'Tilt (up/down)', action: { kind: 'tilt' } },
  { label: 'Movement speed', action: { kind: 'speed' } },
  { label: 'Light sensitivity', action: { kind: 'reactivity' } },
  { label: 'Color (scroll favorites)', action: { kind: 'colorPick' } }
]

function favRgbToHex(c: { r: number; g: number; b: number }): string {
  const h = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}
function favHexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function describeAction(action: PadAction): string {
  switch (action.kind) {
    case 'pad':
      return `Pad ${action.padIndex + 1}`
    case 'blackout':
      return 'Blackout'
    case 'strobe':
      return 'Strobe (hold)'
    case 'tap':
      return 'Tap tempo'
    case 'resync':
      return 'Resync beat 1'
    case 'autopilot':
      return 'Autopilot on/off'
    case 'manual':
      return 'Manual trigger'
  }
}

let patchCounter = 0

function ViewModeToggle({
  mode,
  onChange
}: {
  mode: 'grid' | 'list'
  onChange: (mode: 'grid' | 'list') => void
}): JSX.Element {
  return (
    <div className="segmented view-toggle">
      <button className={mode === 'grid' ? 'active' : ''} title="Grid view" onClick={() => onChange('grid')}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      </button>
      <button className={mode === 'list' ? 'active' : ''} title="List view" onClick={() => onChange('list')}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

export function SetupPanel({ view }: { view: SetupView }): JSX.Element {
  const { project, updateProject, status, refreshStatus, applyLoadedProject } = useLightingStore()
  const [stages, setStages] = useState<{ id: string; name: string; active: boolean }[]>([])
  const [renamingStageId, setRenamingStageId] = useState<string | null>(null)
  const [midiModalOpen, setMidiModalOpen] = useState(false)

  const refreshStages = useCallback(async () => {
    setStages(await window.djCompanion.lighting.listStages())
  }, [])
  const [addForm, setAddForm] = useState({
    definitionId: BUILTIN_FIXTURES[0].id,
    universe: 1,
    address: 1,
    count: 1,
    group: ''
  })
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)
  const [limitsForPatch, setLimitsForPatch] = useState<string | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [learningAction, setLearningAction] = useState<PadAction | null>(null)
  const [learningControl, setLearningControl] = useState<ControlKind | null>(null)
  const [midiMapVersion, setMidiMapVersion] = useState(0)
  const [serialPorts, setSerialPorts] = useState<{ path: string; label: string }[]>([])
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [audioRunning, setAudioRunning] = useState(audioAnalyzer.isRunning())
  const [levels, setLevels] = useState({ rms: 0, bass: 0, mid: 0, high: 0 })
  const [profileEditor, setProfileEditor] = useState<'closed' | 'new' | string>('closed')
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [promptCopied, setPromptCopied] = useState(false)
  const lastMeterUpdateRef = useRef(0)

  const refreshSerialPorts = useCallback(async () => {
    setSerialPorts(await window.djCompanion.lighting.listSerialPorts())
  }, [])

  useEffect(() => {
    const offFrame = onAudioFrame((frame) => {
      if (frame.timestampMs - lastMeterUpdateRef.current > 90) {
        lastMeterUpdateRef.current = frame.timestampMs
        setLevels({ rms: frame.rms, bass: frame.bass, mid: frame.mid, high: frame.high })
      }
    })
    const offState = onAudioStateChange(setAudioRunning)
    return () => {
      offFrame()
      offState()
    }
  }, [])

  async function selectAudioDevice(deviceId: string): Promise<void> {
    const label = audioDevices.find((d) => d.deviceId === deviceId)?.label ?? null
    await updateProject((p) => ({
      ...p,
      audio: { ...p.audio, deviceId: deviceId || null, deviceLabel: label }
    }))
    // Switching devices while listening restarts capture on the new one.
    if (deviceId && audioAnalyzer.isRunning()) {
      await startAudioListening(deviceId)
    }
  }

  async function toggleAudio(): Promise<void> {
    if (audioRunning) {
      await stopAudioListening()
      return
    }
    if (project.audio.deviceId) await startAudioListening(project.audio.deviceId)
  }

  useEffect(() => {
    // MIDI may not have been initialized yet if the user opened Setup first;
    // learn-mode capture needs an active connection. Perform mode re-registers
    // its own handlers when it mounts.
    if (!midiPads.isStarted()) {
      midiPads.start({ onAction: () => undefined })
    }
    refreshSerialPorts()
    refreshStages()
    AudioAnalyzer.listInputDevices().then(setAudioDevices)
    const interval = setInterval(refreshStatus, 1000) // live OS2L connection status
    return () => {
      midiPads.cancelLearn()
      clearInterval(interval)
    }
  }, [refreshSerialPorts, refreshStatus, refreshStages])

  const defs = useMemo(() => fixturesById(project.customFixtures), [project.customFixtures])
  const allProfiles = useMemo(
    () => [...BUILTIN_FIXTURES, ...project.customFixtures],
    [project.customFixtures]
  )
  const overlaps = useMemo(
    () => findAddressOverlaps(project.patches, defs),
    [project.patches, defs]
  )
  const overlappingIds = useMemo(
    () => new Set(overlaps.flatMap((o) => [o.a.id, o.b.id])),
    [overlaps]
  )
  const sceneRig = useMemo(() => rigProfile(project.patches, defs), [project.patches, defs])
  const compatibleScenes = useMemo(
    () => project.scenes.filter((s) => sceneCompatible(s, sceneRig)),
    [project.scenes, sceneRig]
  )
  const incompatibleScenes = useMemo(
    () => project.scenes.filter((s) => !sceneCompatible(s, sceneRig)),
    [project.scenes, sceneRig]
  )

  const duplicateScene = useCallback(
    (id: string) =>
      updateProject((p) => {
        const copy = structuredClone(p.scenes.find((s) => s.id === id)!)
        copy.id = `scene-${Date.now()}`
        copy.name = `${copy.name} Copy`
        return { ...p, scenes: [...p.scenes, copy] }
      }),
    [updateProject]
  )
  const deleteScene = useCallback(
    (id: string) =>
      updateProject((p) => {
        const removed = p.scenes.find((s) => s.id === id)
        return {
          ...p,
          scenes: p.scenes.filter((s) => s.id !== id),
          // Keep the last 24 deletions recoverable from the trash bin.
          trashScenes: removed ? [removed, ...(p.trashScenes ?? [])].slice(0, 24) : p.trashScenes ?? [],
          padSceneIds: p.padSceneIds.map((x) => (x === id ? null : x)),
          autopilot: { ...p.autopilot, sceneIds: p.autopilot.sceneIds.filter((x) => x !== id) }
        }
      }),
    [updateProject]
  )
  const recoverScene = useCallback(
    (id: string) =>
      updateProject((p) => {
        const scene = (p.trashScenes ?? []).find((s) => s.id === id)
        if (!scene) return p
        const clash = p.scenes.some((s) => s.id === scene.id)
        const restored = clash ? { ...scene, id: `scene-${Date.now()}` } : scene
        return {
          ...p,
          scenes: [...p.scenes, restored],
          trashScenes: (p.trashScenes ?? []).filter((s) => s.id !== id)
        }
      }),
    [updateProject]
  )

  const sceneTile = (scene: Scene): JSX.Element => (
    <SceneTile
      key={scene.id}
      scene={scene}
      title={describeScene(scene)}
      onClick={() => setEditingSceneId(scene.id)}
      actions={
        <>
          <button className="tile-icon-btn" title="Duplicate" onClick={() => duplicateScene(scene.id)}>
            ⧉
          </button>
          <button className="tile-icon-btn danger" title="Delete" onClick={() => deleteScene(scene.id)}>
            ✕
          </button>
        </>
      }
    />
  )
  const sceneListItem = (scene: Scene): JSX.Element => (
    <div key={scene.id} className="scene-list-item">
      <span className="scene-dot" style={{ background: scene.uiColor }} />
      <div className="scene-list-main">
        <span className="scene-name">{scene.name}</span>
        <span className="scene-desc">{describeScene(scene)}</span>
      </div>
      <button className="text-button" onClick={() => setEditingSceneId(scene.id)}>
        Edit
      </button>
      <button className="text-button" onClick={() => duplicateScene(scene.id)}>
        Duplicate
      </button>
      <button className="text-button danger" onClick={() => deleteScene(scene.id)}>
        Delete
      </button>
    </div>
  )

  const startNoteLearn = (action: PadAction): void => {
    midiPads.cancelLearn()
    setLearningControl(null)
    setLearningAction(action)
    midiPads.learnOnce((note) => {
      midiPads.bind(note, action)
      setLearningAction(null)
      setMidiMapVersion((v) => v + 1)
    })
  }
  const startControlLearn = (action: ControlAction): void => {
    midiPads.cancelLearn()
    setLearningAction(null)
    setLearningControl(action.kind)
    midiPads.learnControlOnce((cc) => {
      const prev = Object.entries(midiPads.getMapping().controls).find(
        ([, a]) => a.kind === action.kind
      )?.[0]
      if (prev) midiPads.unbindControl(Number(prev))
      midiPads.bindControl(cc, action)
      setLearningControl(null)
      setMidiMapVersion((v) => v + 1)
    })
  }

  function addFixtures(): void {
    const definition = defs.get(addForm.definitionId)
    if (!definition) return
    const footprint = fixtureFootprint(definition)
    updateProject((p) => {
      const patches = [...p.patches]
      let address = addForm.address
      for (let i = 0; i < Math.max(1, addForm.count); i++) {
        patchCounter += 1
        patches.push({
          id: `patch-${Date.now()}-${patchCounter}`,
          definitionId: definition.id,
          label: `${definition.name.split(' (')[0]} ${patches.length + 1}`,
          universe: addForm.universe,
          address,
          group: addForm.group || undefined
        })
        address += footprint
      }
      return { ...p, patches }
    })
  }

  const editingScene = project.scenes.find((s) => s.id === editingSceneId) ?? null

  return (
    <SetupViewContext.Provider value={view}>
    <div className="setup-panel">
      <SetupSection
        id="stages"
        title="Stages & Rig"
        help={<>A stage is a complete saved setup: rig, scenes, pads, everything. Keep one per venue or
          gig and switch between them. The preview below shows the active stage.</>}
      >
        <div className="stage-tabs">
          {stages.map((stage) =>
            renamingStageId === stage.id ? (
              <input
                key={stage.id}
                className="stage-tab-rename"
                autoFocus
                defaultValue={stage.name}
                onFocus={(e) => e.target.select()}
                onBlur={async (e) => {
                  const name = e.target.value.trim()
                  if (name && name !== stage.name) {
                    await window.djCompanion.lighting.renameStage(stage.id, name)
                  }
                  setRenamingStageId(null)
                  refreshStages()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setRenamingStageId(null)
                }}
              />
            ) : (
              <button
                key={stage.id}
                className={`stage-tab${stage.active ? ' active' : ''}`}
                title={stage.active ? 'Double-click to rename' : `Switch to ${stage.name}`}
                onClick={async () => {
                  if (stage.active) return
                  const project = await window.djCompanion.lighting.switchStage(stage.id)
                  applyLoadedProject(project)
                  refreshStages()
                }}
                onDoubleClick={() => stage.active && setRenamingStageId(stage.id)}
              >
                {stage.name}
              </button>
            )
          )}
          <button
            className="stage-tab ghost"
            title="New empty stage"
            onClick={async () => {
              const project = await window.djCompanion.lighting.newStage('New Stage')
              applyLoadedProject(project)
              const list = await window.djCompanion.lighting.listStages()
              setStages(list)
              setRenamingStageId(list.find((s) => s.active)?.id ?? null)
            }}
          >
            +
          </button>
          <button
            className="stage-tab ghost"
            title="Duplicate current stage"
            onClick={async () => {
              const active = stages.find((s) => s.active)
              const project = await window.djCompanion.lighting.saveStageAs(`${active?.name ?? 'Stage'} copy`)
              applyLoadedProject(project)
              const list = await window.djCompanion.lighting.listStages()
              setStages(list)
              setRenamingStageId(list.find((s) => s.active)?.id ?? null)
            }}
          >
            ⧉
          </button>
          {stages.length > 1 && (
            <button
              className="stage-tab ghost danger"
              title="Delete current stage"
              onClick={async () => {
                const active = stages.find((s) => s.active)
                if (!active) return
                if (!window.confirm(`Delete stage "${active.name}"? This cannot be undone.`)) return
                const project = await window.djCompanion.lighting.deleteStage(active.id)
                applyLoadedProject(project)
                refreshStages()
              }}
            >
              ✕
            </button>
          )}
        </div>
        <div className="stages-preview-hint settings-hint">
          Live preview of the active stage. Drag fixtures to match your real rig: sideways to
          reposition, up to the truss, down to the floor.
        </div>
        <StageVisualizer height={300} editable className="stage-setup-canvas" />
      </SetupSection>

      <SetupSection
        id="audio"
        views={['settings']}
        title="Audio input, backup beat source"
        help={<>Optional. OS2L is the primary beat source; use this only as a fallback (e.g. DJ software
          without OS2L). Route your master output here through a virtual audio cable and the tempo
          is estimated from the live audio.</>}
      >
        <div className="setup-row">
          <select value={project.audio.deviceId ?? ''} onChange={(e) => selectAudioDevice(e.target.value)}>
            <option value="">Select audio input…</option>
            {audioDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Input ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
          <button
            className={audioRunning ? 'danger-button' : 'secondary-button'}
            onClick={toggleAudio}
            disabled={!audioRunning && !project.audio.deviceId}
          >
            {audioRunning ? 'Stop' : 'Listen'}
          </button>
          <label className="settings-checkbox-row" style={{ marginBottom: 0 }}>
            <input
              type="checkbox"
              checked={project.audio.autoListen}
              onChange={(e) =>
                updateProject((p) => ({ ...p, audio: { ...p.audio, autoListen: e.target.checked } }))
              }
            />
            Start listening automatically
          </label>
          {audioRunning && (
            <div className="setup-meters">
              {(
                [
                  ['Bass', levels.bass],
                  ['Mid', levels.mid],
                  ['High', levels.high],
                  ['Vol', levels.rms]
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="setup-meter" title={label}>
                  <div className="setup-meter-fill" style={{ width: `${Math.round(value * 100)}%` }} />
                </div>
              ))}
            </div>
          )}
          <label className="settings-checkbox-row" style={{ marginBottom: 0 }}>
            <input
              type="checkbox"
              defaultChecked
              onChange={(e) => window.djCompanion.lighting.setBpmFollowsAudio(e.target.checked)}
            />
            BPM follows audio
          </label>
        </div>
      </SetupSection>

      <SetupSection id="dmx" views={['settings']} title="DMX output">
        <div className="setup-row">
          <label>Protocol</label>
          <select
            value={project.output.protocol}
            onChange={(e) =>
              updateProject((p) => ({
                ...p,
                output: { ...p.output, protocol: e.target.value as OutputProtocol }
              }))
            }
          >
            <option value="artnet">Art-Net (network, broadcast/unicast)</option>
            <option value="sacn">sACN E1.31 (network, multicast)</option>
            <option value="enttec">USB - Enttec DMX USB Pro / compatible</option>
          </select>
          {project.output.protocol === 'artnet' && (
            <>
              <label>Target</label>
              <input
                type="text"
                value={project.output.artnetHost}
                placeholder="255.255.255.255"
                onChange={(e) =>
                  updateProject((p) => ({ ...p, output: { ...p.output, artnetHost: e.target.value } }))
                }
              />
            </>
          )}
          {project.output.protocol === 'enttec' && (
            <>
              <label>Serial port</label>
              <select
                value={project.output.serialPath ?? ''}
                onChange={(e) =>
                  updateProject((p) => ({
                    ...p,
                    output: { ...p.output, serialPath: e.target.value || null }
                  }))
                }
              >
                <option value="">Select interface…</option>
                {serialPorts.map((port) => (
                  <option key={port.path} value={port.path}>
                    {port.label}
                  </option>
                ))}
              </select>
              <button className="text-button" onClick={refreshSerialPorts}>
                Refresh
              </button>
              <label>Universe</label>
              <input
                type="number"
                min={0}
                max={63999}
                value={project.output.usbUniverse}
                title="A USB interface drives one DMX line - fixtures patched to this universe are output"
                onChange={(e) =>
                  updateProject((p) => ({
                    ...p,
                    output: { ...p.output, usbUniverse: Number(e.target.value) }
                  }))
                }
              />
            </>
          )}
        </div>
        <p className="settings-hint">
          {project.output.protocol === 'enttec'
            ? 'Works with the Enttec DMX USB Pro and Pro-compatible clones (framed serial protocol). The original "Open DMX USB" (raw FTDI) is not supported - it can\'t be timed reliably from software.'
            : 'Works with any Art-Net/sACN node or interface. Note: sACN universes start at 1.'}
        </p>
        <div className="diag-heading">Connection &amp; troubleshooting</div>
        <OutputDiagnostics />
      </SetupSection>

      <SetupSection id="os2l" views={['settings']} title="OS2L, DJ software beat link">
        <div className="setup-row">
          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={project.os2l.enabled}
              onChange={(e) =>
                updateProject((p) => ({ ...p, os2l: { ...p.os2l, enabled: e.target.checked } }))
              }
            />
            Enable OS2L server
          </label>
          <label>Port</label>
          <input
            type="number"
            min={1024}
            max={65535}
            value={project.os2l.port}
            onChange={(e) =>
              updateProject((p) => ({ ...p, os2l: { ...p.os2l, port: Number(e.target.value) || 4444 } }))
            }
          />
          {status?.os2lConnected ? (
            <span className="os2l-status connected">● DJ software connected</span>
          ) : project.os2l.enabled ? (
            <span className="os2l-status waiting">○ Waiting for connection…</span>
          ) : null}
        </div>
        {status?.os2lError && <div className="banner error">OS2L: {status.os2lError}</div>}
        {project.os2l.enabled && !status?.os2lConnected && (
          <div className="os2l-help">
            <strong>Connecting VirtualDJ:</strong>
            <ol>
              <li>
                In VirtualDJ: Settings → Options, search <code>os2l</code>, set it to{' '}
                <code>yes</code>
                {status?.os2lDiscovery === 'bonjour'
                  ? ' - this app is being advertised via Bonjour, so auto-detection should find it.'
                  : '.'}
              </li>
              <li>
                If it doesn&rsquo;t connect, set <code>os2lDirectIp</code> to{' '}
                <code>127.0.0.1:{project.os2l.port}</code> if VirtualDJ runs on this computer,
                or <code>{status?.os2lAddress ?? '…'}</code> from another machine.
              </li>
              <li>
                <strong>Restart VirtualDJ</strong> - it only (re)connects on startup or when the
                os2l settings change. Then play a track.
              </li>
            </ol>
          </div>
        )}
        <p className="settings-hint">
          OS2L streams the exact beat grid and BPM from your DJ software - the most accurate sync
          possible. While connected, the beat source badge in Perform shows <strong>OS2L</strong>{' '}
          and effects lock to the deck&rsquo;s bars and phrases.
        </p>
      </SetupSection>

      <SetupSection id="fixtures" title="Fixtures">
        {overlaps.length > 0 && (
          <div className="banner error">
            {overlaps.length} address overlap{overlaps.length === 1 ? '' : 's'} - highlighted fixtures
            share DMX channels.
          </div>
        )}
        <table className="library-table setup-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Profile</th>
              <th>Group</th>
              <th>Universe</th>
              <th>Address</th>
              <th>Channels</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {project.patches.map((patch) => {
              const def = defs.get(patch.definitionId)
              return (
                <tr key={patch.id} className={overlappingIds.has(patch.id) ? 'row-overlap' : ''}>
                  <td>
                    <input
                      className="inline-input"
                      value={patch.label}
                      onChange={(e) =>
                        updateProject((p) => ({
                          ...p,
                          patches: p.patches.map((x) =>
                            x.id === patch.id ? { ...x, label: e.target.value } : x
                          )
                        }))
                      }
                    />
                  </td>
                  <td className="fixture-profile-cell">
                    <FixtureIcon kind={def?.kind ?? 'other'} size={18} />
                    <span>{def?.name ?? patch.definitionId}</span>
                  </td>
                  <td>
                    <input
                      className="inline-input narrow"
                      value={patch.group ?? ''}
                      placeholder="-"
                      onChange={(e) =>
                        updateProject((p) => ({
                          ...p,
                          patches: p.patches.map((x) =>
                            x.id === patch.id ? { ...x, group: e.target.value || undefined } : x
                          )
                        }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="inline-input narrow"
                      type="number"
                      min={project.output.protocol === 'sacn' ? 1 : 0}
                      value={patch.universe}
                      onChange={(e) =>
                        updateProject((p) => ({
                          ...p,
                          patches: p.patches.map((x) =>
                            x.id === patch.id ? { ...x, universe: Number(e.target.value) } : x
                          )
                        }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="inline-input narrow"
                      type="number"
                      min={1}
                      max={512}
                      value={patch.address}
                      onChange={(e) =>
                        updateProject((p) => ({
                          ...p,
                          patches: p.patches.map((x) =>
                            x.id === patch.id ? { ...x, address: Number(e.target.value) } : x
                          )
                        }))
                      }
                    />
                  </td>
                  <td>{def ? fixtureFootprint(def) : '?'}</td>
                  <td className="fixture-actions-cell">
                    <button
                      className={`text-button${patch.limits ? ' active' : ''}`}
                      title="Limit movement range, invert an axis, cap brightness"
                      onClick={() => setLimitsForPatch(patch.id)}
                    >
                      Limits{patch.limits ? ' ●' : ''}
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        updateProject((p) => ({
                          ...p,
                          patches: p.patches.filter((x) => x.id !== patch.id)
                        }))
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              )
            })}
            {project.patches.length === 0 && (
              <tr>
                <td colSpan={7} className="setup-empty">
                  No fixtures patched yet - add your rig below.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {limitsForPatch &&
          (() => {
            const patch = project.patches.find((x) => x.id === limitsForPatch)
            if (!patch) return null
            return (
              <FixtureLimitsModal
                patch={patch}
                definition={defs.get(patch.definitionId)}
                onChange={(limits) =>
                  updateProject((p) => ({
                    ...p,
                    patches: p.patches.map((x) => (x.id === patch.id ? { ...x, limits } : x))
                  }))
                }
                onClose={() => setLimitsForPatch(null)}
              />
            )
          })()}

        <div className="add-fixture-row">
          <select
            value={addForm.definitionId}
            onChange={(e) => setAddForm({ ...addForm, definitionId: e.target.value })}
          >
            {allProfiles.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <label>Universe</label>
          <input
            type="number"
            min={project.output.protocol === 'sacn' ? 1 : 0}
            value={addForm.universe}
            onChange={(e) => setAddForm({ ...addForm, universe: Number(e.target.value) })}
          />
          <label>Address</label>
          <input
            type="number"
            min={1}
            max={512}
            value={addForm.address}
            onChange={(e) => setAddForm({ ...addForm, address: Number(e.target.value) })}
          />
          <label>Qty</label>
          <input
            type="number"
            min={1}
            max={64}
            value={addForm.count}
            onChange={(e) => setAddForm({ ...addForm, count: Number(e.target.value) })}
          />
          <label>Group</label>
          <input
            type="text"
            placeholder="pars, movers…"
            value={addForm.group}
            onChange={(e) => setAddForm({ ...addForm, group: e.target.value })}
          />
          <button className="primary-button" onClick={addFixtures}>
            Add
          </button>
        </div>
      </SetupSection>

      <SetupSection title="Custom fixture profiles" help={<>Fixture not in the built-in list? Build its profile from the DMX channel chart in its
          manual. Works for any brand and any channel mode.</>}>
        {project.customFixtures.length > 0 && (
          <div className="scene-list">
            {project.customFixtures.map((profile) => (
              <div key={profile.id} className="scene-list-item">
                <span className="scene-name">
                  {profile.name}{' '}
                  <span className="settings-hint" style={{ margin: 0 }}>
                    ({profile.channels.length}ch)
                  </span>
                </span>
                <button className="text-button" onClick={() => setProfileEditor(profile.id)}>
                  Edit
                </button>
                <button
                  className="text-button danger"
                  disabled={project.patches.some((p) => p.definitionId === profile.id)}
                  title={
                    project.patches.some((p) => p.definitionId === profile.id)
                      ? 'In use by a patched fixture'
                      : undefined
                  }
                  onClick={() =>
                    updateProject((p) => ({
                      ...p,
                      customFixtures: p.customFixtures.filter((f) => f.id !== profile.id)
                    }))
                  }
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="fixture-import">
          <div className="fixture-import-head">
            <span className="picker-label" style={{ margin: 0 }}>
              Import a fixture (paste or file)
            </span>
            <button
              className="secondary-button"
              onClick={() => {
                navigator.clipboard
                  .writeText(FIXTURE_AI_PROMPT)
                  .then(() => {
                    setPromptCopied(true)
                    setTimeout(() => setPromptCopied(false), 2500)
                  })
                  .catch(() => undefined)
              }}
            >
              {promptCopied ? 'Copied!' : 'Copy AI prompt'}
            </button>
            <label className="secondary-button fixture-import-file">
              Load file…
              <input
                type="file"
                accept=".json,.txt"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  file.text().then((t) => {
                    setImportText(t)
                    setImportError(null)
                  })
                }}
              />
            </label>
          </div>
          <span className="settings-hint" style={{ margin: '2px 0 8px' }}>
            No AI is built in: paste the prompt into any AI chat with your fixture&apos;s DMX
            manual (and photos), then paste the JSON it returns here and Import.
          </span>
          <textarea
            className="fixture-import-text"
            spellCheck={false}
            placeholder={'{\n  "name": "My Panel (165ch)",\n  "kind": "strobe",\n  "pixels": [{ "count": 45, "channels": ["red","green","blue"] }, { "count": 30, "channels": ["white"] }]\n}'}
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value)
              setImportError(null)
            }}
          />
          {importError && <div className="banner error">{importError}</div>}
          <button
            className="primary-button"
            disabled={!importText.trim()}
            onClick={() => {
              const { fixture, error } = parseFixtureImport(importText)
              if (error || !fixture) {
                setImportError(error ?? 'Import failed.')
                return
              }
              updateProject((p) => ({
                ...p,
                customFixtures: [...p.customFixtures.filter((f) => f.id !== fixture.id), fixture]
              }))
              setImportText('')
              setImportError(null)
            }}
          >
            Import fixture
          </button>
        </div>
        {profileEditor === 'closed' ? (
          <button className="secondary-button" onClick={() => setProfileEditor('new')}>
            New Custom Profile
          </button>
        ) : (
          <CustomFixtureEditor
            existing={
              profileEditor === 'new'
                ? null
                : (project.customFixtures.find((f) => f.id === profileEditor) ?? null)
            }
            onSave={(definition) => {
              updateProject((p) => ({
                ...p,
                customFixtures: [
                  ...p.customFixtures.filter((f) => f.id !== definition.id),
                  definition
                ]
              }))
              setProfileEditor('closed')
            }}
            onCancel={() => setProfileEditor('closed')}
          />
        )}
      </SetupSection>

      <SetupSection id="scenes" title="Scenes">
        <div className="section-toolbar">
          <ViewModeToggle
            mode={project.sceneViewMode}
            onChange={(m) => updateProject((p) => ({ ...p, sceneViewMode: m }))}
          />
          <button
            className="secondary-button trash-button"
            title="Recover deleted scenes"
            disabled={!(project.trashScenes && project.trashScenes.length > 0)}
            onClick={() => setTrashOpen(true)}
          >
            🗑 Trash{project.trashScenes && project.trashScenes.length > 0 ? ` (${project.trashScenes.length})` : ''}
          </button>
        </div>

        {trashOpen && (
          <div className="scene-browser-overlay" onClick={() => setTrashOpen(false)}>
            <div className="trash-modal" onClick={(e) => e.stopPropagation()}>
              <div className="scene-browser-head">
                <h3>Deleted scenes</h3>
                <div className="scene-browser-head-actions">
                  {project.trashScenes && project.trashScenes.length > 0 && (
                    <button
                      className="text-button danger"
                      onClick={() => updateProject((p) => ({ ...p, trashScenes: [] }))}
                    >
                      Empty trash
                    </button>
                  )}
                  <button className="secondary-button" onClick={() => setTrashOpen(false)}>
                    Close
                  </button>
                </div>
              </div>
              {project.trashScenes && project.trashScenes.length > 0 ? (
                <div className="trash-list">
                  {project.trashScenes.map((scene) => (
                    <div key={scene.id} className="trash-row">
                      <span className="scene-dot" style={{ background: scene.uiColor }} />
                      <span className="scene-name">{scene.name}</span>
                      <button className="secondary-button" onClick={() => recoverScene(scene.id)}>
                        Recover
                      </button>
                      <button
                        className="text-button danger"
                        title="Delete forever"
                        onClick={() =>
                          updateProject((p) => ({
                            ...p,
                            trashScenes: (p.trashScenes ?? []).filter((s) => s.id !== scene.id)
                          }))
                        }
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="settings-hint">Trash is empty. Deleted scenes appear here.</p>
              )}
            </div>
          </div>
        )}
        {project.sceneViewMode === 'grid' ? (
          <div className="scene-groups">
            {groupScenesByCategory(compatibleScenes).map((groupItem) => (
              <div key={groupItem.key} className="scene-group">
                <div className="scene-group-title">{groupItem.label}</div>
                <div className="scene-tile-grid">{groupItem.scenes.map(sceneTile)}</div>
              </div>
            ))}
            {incompatibleScenes.length > 0 && (
              <div className="scene-group">
                <div className="scene-group-title">Not compatible with your rig</div>
                <p className="settings-hint">
                  These drive fixture types you have not patched (lasers, movers, fog...), so they
                  output nothing on your current setup. Hover any tile for what it does.
                </p>
                <div className="scene-tile-grid incompatible">{incompatibleScenes.map(sceneTile)}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="scene-list">
            {compatibleScenes.map(sceneListItem)}
            {incompatibleScenes.length > 0 && (
              <>
                <div className="scene-group-title scene-list-divider">Not compatible with your rig</div>
                <div className="scene-list incompatible">{incompatibleScenes.map(sceneListItem)}</div>
              </>
            )}
          </div>
        )}
        <button
          className="secondary-button"
          onClick={() => {
            const id = `scene-${Date.now()}`
            updateProject((p) => ({
              ...p,
              scenes: [
                ...p.scenes,
                {
                  id,
                  name: `Scene ${p.scenes.length + 1}`,
                  uiColor: '#8b5cf6',
                  targets: [{ group: 'all', color: { r: 255, g: 255, b: 255 }, dimmer: 0.8 }]
                }
              ]
            }))
            setEditingSceneId(id) // open the editor right away, like building one
          }}
        >
          + New Scene
        </button>

        {editingScene && (
          <SceneEditorModal
            scene={editingScene}
            onChange={(updated) =>
              updateProject((p) => ({
                ...p,
                scenes: p.scenes.map((s) => (s.id === updated.id ? updated : s))
              }))
            }
            onClose={() => setEditingSceneId(null)}
          />
        )}
      </SetupSection>

      <SetupSection id="smart" title="Smart Mode" help={<>The automatic VJ: while enabled (button in Perform), a scene keeps playing as long as the
          track keeps its mood - it rotates only when the music genuinely changes (level or bass/high
          balance shifting for a few seconds), always on a phrase boundary. Build-ups ramp intensity,
          a Peak scene slams on the drop, breakdowns fall to a Chill scene, and stripped-back
          bass-and-drums passages prefer beat-reactive looks. Uses the OS2L beat grid plus live audio
          energy. Anything unassigned below is never auto-fired.</>}>
        <div className="setup-row">
          <label>Sensitivity</label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(project.smart.sensitivity * 100)}
            onChange={(e) =>
              updateProject((p) => ({
                ...p,
                smart: { ...p.smart, sensitivity: Number(e.target.value) / 100 }
              }))
            }
          />
          <span className="settings-hint" style={{ margin: 0 }}>
            {project.smart.sensitivity < 0.34 ? 'calm' : project.smart.sensitivity > 0.67 ? 'eager' : 'balanced'}
          </span>
          <label>Max hold</label>
          <input
            type="number"
            min={1}
            max={16}
            title="Even with an unchanging mood, rotate after this many 8-bar phrases"
            value={project.smart.phrasesPerScene}
            onChange={(e) =>
              updateProject((p) => ({
                ...p,
                smart: { ...p.smart, phrasesPerScene: Math.max(1, Number(e.target.value) || 4) }
              }))
            }
          />
          <span className="settings-hint" style={{ margin: 0 }}>
            phrases
          </span>
          <button
            className="secondary-button"
            title="Assign built-in presets to sensible pools automatically"
            onClick={() =>
              updateProject((p) => ({
                ...p,
                smart: { ...p.smart, pools: defaultSmartPools(p.scenes.map((s) => s.id)) }
              }))
            }
          >
            Auto-assign
          </button>
        </div>
        <div className={`smart-pool-grid ${project.sceneViewMode}`}>
          {project.scenes
            .filter((s) => !s.momentary)
            .map((scene) => {
              const pool = (['chill', 'main', 'peak'] as const).find((key) =>
                project.smart.pools[key].includes(scene.id)
              )
              return (
                <div key={scene.id} className="smart-pool-row">
                  <span className="scene-dot" style={{ background: scene.uiColor }} />
                  <span className="scene-name">{scene.name}</span>
                  <select
                    value={pool ?? ''}
                    onChange={(e) => {
                      const next = e.target.value as '' | 'chill' | 'main' | 'peak'
                      updateProject((p) => {
                        const pools = {
                          chill: p.smart.pools.chill.filter((id) => id !== scene.id),
                          main: p.smart.pools.main.filter((id) => id !== scene.id),
                          peak: p.smart.pools.peak.filter((id) => id !== scene.id)
                        }
                        if (next) pools[next] = [...pools[next], scene.id]
                        return { ...p, smart: { ...p.smart, pools } }
                      })
                    }}
                  >
                    <option value="">- not used -</option>
                    <option value="chill">Chill (breakdowns)</option>
                    <option value="main">Main (steady rotation)</option>
                    <option value="peak">Peak (drops)</option>
                  </select>
                </div>
              )
            })}
        </div>
      </SetupSection>

      <SetupSection id="autopilot" title="Autopilot" help={<>Simple rotation (no audio analysis): cycles the checked scenes every N bars. For the
          full automatic show, use Smart Mode instead.</>}>
        <div className="setup-row">
          <label>Every</label>
          <input
            type="number"
            min={1}
            max={64}
            value={project.autopilot.barsPerScene}
            onChange={(e) =>
              updateProject((p) => ({
                ...p,
                autopilot: { ...p.autopilot, barsPerScene: Number(e.target.value) || 8 }
              }))
            }
          />
          <span className="settings-hint" style={{ margin: 0 }}>
            bars
          </span>
          <label className="settings-checkbox-row" style={{ marginBottom: 0 }}>
            <input
              type="checkbox"
              checked={project.autopilot.shuffle ?? false}
              onChange={(e) =>
                updateProject((p) => ({
                  ...p,
                  autopilot: { ...p.autopilot, shuffle: e.target.checked }
                }))
              }
            />
            Shuffle order
          </label>
        </div>
        <div className={`smart-pool-grid ${project.sceneViewMode}`}>
          {project.scenes
            .filter((s) => !s.momentary)
            .map((scene) => {
              const included =
                project.autopilot.sceneIds.length === 0 || project.autopilot.sceneIds.includes(scene.id)
              return (
                <label key={scene.id} className="smart-pool-row autopilot-row">
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={(e) =>
                      updateProject((p) => {
                        // Empty list means "all": materialize it before editing.
                        const current =
                          p.autopilot.sceneIds.length === 0
                            ? p.scenes.filter((s) => !s.momentary).map((s) => s.id)
                            : p.autopilot.sceneIds
                        const sceneIds = e.target.checked
                          ? [...current, scene.id]
                          : current.filter((id) => id !== scene.id)
                        return { ...p, autopilot: { ...p.autopilot, sceneIds } }
                      })
                    }
                  />
                  <span className="scene-dot" style={{ background: scene.uiColor }} />
                  <span className="scene-name">{scene.name}</span>
                </label>
              )
            })}
        </div>
      </SetupSection>

      <SetupSection id="midi" views={['settings']} title="MIDI controller" help={<>Bind pads to scenes/buttons and knobs or faders to live controls (master brightness, pan,
          tilt, speed, sensitivity). Click a Learn button, then hit the pad or move the knob - click
          again to cancel.</>}>
        <div className="setup-row">
          <button className="secondary-button" onClick={() => setMidiModalOpen(true)}>
            Assign MIDI…
          </button>
          <span className="settings-hint" style={{ margin: 0 }}>
            {midiPads.deviceNames().length > 0
              ? `Connected: ${midiPads.deviceNames().join(', ')}`
              : 'No MIDI device detected - plug one in and it appears automatically.'}
          </span>
        </div>

        {midiModalOpen && (
          <div
            className="stage-overlay"
            onClick={() => {
              midiPads.cancelLearn()
              setLearningAction(null)
              setLearningControl(null)
              setMidiModalOpen(false)
            }}
          >
            <div className="stage-overlay-panel midi-modal" onClick={(e) => e.stopPropagation()}>
              <div className="stage-overlay-header">
                <h2>MIDI Assignments</h2>
                <span className="settings-hint" style={{ margin: 0 }}>
                  Click Learn, hit a pad on your controller. Click again to cancel.
                </span>
                <button
                  className="secondary-button"
                  onClick={() => {
                    midiPads.cancelLearn()
                    setLearningAction(null)
                    setLearningControl(null)
                    setMidiModalOpen(false)
                  }}
                >
                  Done
                </button>
              </div>
              <div className="midi-modal-body">
                <div className="midi-col midi-col-pads">
                  <div className="midi-block-title">Pads</div>
                  <span className="settings-hint" style={{ margin: '0 0 8px' }}>
                    Click a pad, then hit the matching pad on your controller.
                  </span>
                  <div
                    className={`midi-pad-grid cols-${padColumns(project.padCount)}`}
                    data-version={midiMapVersion}
                  >
                {Array.from({ length: project.padCount }, (_, i) => {
                  const boundNote = Object.entries(midiPads.getMapping().notes).find(
                    ([, action]) => action.kind === 'pad' && action.padIndex === i
                  )?.[0]
                  const isLearning = learningAction?.kind === 'pad' && learningAction.padIndex === i
                  const value = project.padSceneIds[i]
                  const fn = parsePadFunction(value)
                  const assignLabel = fn
                    ? padFunctionInfo(fn).label
                    : value
                      ? (project.scenes.find((s) => s.id === value)?.name ?? 'Scene')
                      : 'empty'
                  return (
                    <div
                      key={i}
                      className={`midi-pad-cell${isLearning ? ' learning' : ''}${boundNote ? ' bound' : ''}`}
                      onClick={() => {
                        if (isLearning) {
                          midiPads.cancelLearn()
                          setLearningAction(null)
                          return
                        }
                        startNoteLearn({ kind: 'pad', padIndex: i })
                      }}
                    >
                      <span className="midi-pad-num">{i + 1}</span>
                      <span className="midi-pad-assign">{assignLabel}</span>
                      <span className="midi-pad-note">
                        {isLearning ? 'hit a pad…' : boundNote ? `note ${boundNote}` : 'Learn'}
                      </span>
                      {boundNote && (
                        <button
                          className="midi-pad-x"
                          title="Unbind"
                          onClick={(e) => {
                            e.stopPropagation()
                            midiPads.unbindNote(Number(boundNote))
                            setMidiMapVersion((v) => v + 1)
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
                  </div>
                </div>

                <div className="midi-col midi-col-settings">
                  <div className="midi-block-title" style={{ marginTop: 0, borderTop: 'none', paddingTop: 0 }}>
                    Buttons
                  </div>
                  <div className="midi-learn-grid single" data-version={midiMapVersion}>
                    {LEARNABLE_ACTIONS.filter((e) => e.action.kind !== 'pad').map((entry) => {
                  const boundNote = Object.entries(midiPads.getMapping().notes).find(
                    ([, action]) => describeAction(action) === entry.label
                  )?.[0]
                  const isLearning =
                    learningAction !== null && describeAction(learningAction) === entry.label
                  return (
                    <div key={entry.label} className="midi-learn-row">
                      <span>{entry.label}</span>
                      <span className="midi-note">{boundNote ? `note ${boundNote}` : '-'}</span>
                      <button
                        className={isLearning ? 'primary-button' : 'secondary-button'}
                        onClick={() => {
                          if (isLearning) {
                            midiPads.cancelLearn()
                            setLearningAction(null)
                            return
                          }
                          startNoteLearn(entry.action)
                        }}
                      >
                        {isLearning ? 'Cancel' : 'Learn'}
                      </button>
                      {boundNote && (
                        <button
                          className="midi-unbind"
                          title="Unbind"
                          onClick={() => {
                            midiPads.unbindNote(Number(boundNote))
                            setMidiMapVersion((v) => v + 1)
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

                  <div className="midi-block-title">Knobs & Faders</div>
                  <span className="settings-hint" style={{ margin: '0 0 8px' }}>
                    Click Learn, then move a knob or fader.
                  </span>
                  <div className="midi-learn-grid single" data-version={midiMapVersion}>
                    {LEARNABLE_CONTROLS.map((entry) => {
                  const boundCc = Object.entries(midiPads.getMapping().controls).find(
                    ([, action]) => action.kind === entry.action.kind
                  )?.[0]
                  const isLearning = learningControl === entry.action.kind
                  return (
                    <div key={entry.action.kind} className="midi-learn-row">
                      <span>{entry.label}</span>
                      <span className="midi-note">{boundCc ? `CC ${boundCc}` : '-'}</span>
                      <button
                        className={isLearning ? 'primary-button' : 'secondary-button'}
                        onClick={() => {
                          if (isLearning) {
                            midiPads.cancelLearn()
                            setLearningControl(null)
                            return
                          }
                          startControlLearn(entry.action)
                        }}
                      >
                        {isLearning ? 'Cancel' : 'Learn'}
                      </button>
                      {boundCc && (
                        <button
                          className="midi-unbind"
                          title="Unbind"
                          onClick={() => {
                            midiPads.unbindControl(Number(boundCc))
                            setMidiMapVersion((v) => v + 1)
                          }}
                        >
                          ✕
                        </button>
                      )}
                        </div>
                      )
                    })}
                  </div>

                  <div className="midi-block-title">Favorite colors</div>
                  <span className="settings-hint" style={{ margin: '0 0 8px' }}>
                    Assign Color + / Color - to pads (buttons step through these) and Color (scroll
                    favorites) to a knob above. Recolors the live scene.
                  </span>
                  <div className="fav-color-row">
                    {(project.favoriteColors ?? []).map((c, i) => (
                      <div key={i} className="fav-color">
                        <input
                          type="color"
                          value={favRgbToHex(c)}
                          onChange={(e) => {
                            const rgb = favHexToRgb(e.target.value)
                            updateProject((p) => {
                              const favs = [...(p.favoriteColors ?? [])]
                              favs[i] = rgb
                              return { ...p, favoriteColors: favs }
                            })
                          }}
                        />
                        <button
                          className="midi-unbind"
                          title="Remove color"
                          onClick={() =>
                            updateProject((p) => ({
                              ...p,
                              favoriteColors: (p.favoriteColors ?? []).filter((_, j) => j !== i)
                            }))
                          }
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      className="secondary-button"
                      onClick={() =>
                        updateProject((p) => ({
                          ...p,
                          favoriteColors: [...(p.favoriteColors ?? []), { r: 255, g: 255, b: 255 }]
                        }))
                      }
                    >
                      + Add
                    </button>
                  </div>
                  <label className="limit-invert" style={{ marginTop: 8, display: 'inline-flex' }}>
                    <input
                      type="checkbox"
                      checked={project.rememberColor === true}
                      onChange={(e) => updateProject((p) => ({ ...p, rememberColor: e.target.checked }))}
                    />{' '}
                    Remember last color across scene changes (default off)
                  </label>

                  <button
                    className="text-button danger"
                    style={{ display: 'block', marginTop: 10 }}
                    onClick={() => {
                      midiPads.unbindAll()
                      setMidiMapVersion((v) => v + 1)
                    }}
                  >
                    Clear all MIDI bindings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </SetupSection>

      <SetupSection id="pads" title="Performance pads" help={<>Set the grid size and save/switch pad layouts. Assign which scene sits on each pad
          from the Live screen (Scenes -&gt; + Pad) or a pad&apos;s corner menu.</>}>
        <div className="setup-row">
          <label>Grid size</label>
          <div className="segmented">
            {[8, 16, 32, 64].map((count) => (
              <button
                key={count}
                className={project.padCount === count ? 'active' : ''}
                onClick={() =>
                  updateProject((p) => ({
                    ...p,
                    padCount: count,
                    padSceneIds: resizePadArray(p.padSceneIds, count)
                  }))
                }
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-row">
          <label>Pad layouts</label>
          <button
            className="secondary-button"
            title="Snapshot the current pad grid so you can switch back to it later"
            onClick={() =>
              updateProject((p) => ({
                ...p,
                padConfigs: [
                  ...(p.padConfigs ?? []),
                  {
                    id: `padcfg-${Date.now()}`,
                    name: `Layout ${(p.padConfigs ?? []).length + 1}`,
                    padCount: p.padCount,
                    padSceneIds: [...p.padSceneIds]
                  }
                ]
              }))
            }
          >
            + Save current layout
          </button>
        </div>
        {(project.padConfigs ?? []).length === 0 ? (
          <p className="settings-hint">
            No saved layouts yet. Arrange your pads, then Save current layout to keep different sets
            (like different scenes, but for the whole pad grid) and load them back anytime.
          </p>
        ) : (
          <div className="pad-config-list">
            {(project.padConfigs ?? []).map((cfg) => (
              <div key={cfg.id} className="pad-config-row">
                <input
                  className="pad-config-name"
                  value={cfg.name}
                  onChange={(e) =>
                    updateProject((p) => ({
                      ...p,
                      padConfigs: (p.padConfigs ?? []).map((c) =>
                        c.id === cfg.id ? { ...c, name: e.target.value } : c
                      )
                    }))
                  }
                />
                <span className="settings-hint" style={{ margin: 0 }}>
                  {cfg.padCount} pads
                </span>
                <button
                  className="secondary-button"
                  onClick={() =>
                    updateProject((p) => ({
                      ...p,
                      padCount: cfg.padCount,
                      padSceneIds: [...cfg.padSceneIds]
                    }))
                  }
                >
                  Load
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    updateProject((p) => ({
                      ...p,
                      padConfigs: (p.padConfigs ?? []).filter((c) => c.id !== cfg.id)
                    }))
                  }
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </SetupSection>
    </div>
    </SetupViewContext.Provider>
  )
}
