import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useLightingStore } from '../../state/lightingStore'
import { BUILTIN_FIXTURES, fixturesById } from '@core/lighting/fixtures/library'
import { findAddressOverlaps, fixtureFootprint } from '@core/lighting/fixtures/types'
import type { OutputProtocol } from '@core/lighting/engine/types'
import { defaultSmartPools } from '@core/lighting/engine/presetScenes'
import { SceneEditorModal } from './SceneEditorModal'
import { SetupSection, SetupViewContext, type SetupView } from './SetupSection'
import { FixtureIcon } from './FixtureIcons'
import { padColumns, resizePadArray } from './padGrid'
import { CustomFixtureEditor } from './CustomFixtureEditor'
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
import type { PadAction } from '../../midi/MidiPads'

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
  const [learningAction, setLearningAction] = useState<PadAction | null>(null)
  const [midiMapVersion, setMidiMapVersion] = useState(0)
  const [serialPorts, setSerialPorts] = useState<{ path: string; label: string }[]>([])
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [audioRunning, setAudioRunning] = useState(audioAnalyzer.isRunning())
  const [levels, setLevels] = useState({ rms: 0, bass: 0, mid: 0, high: 0 })
  const [profileEditor, setProfileEditor] = useState<'closed' | 'new' | string>('closed')
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
                  <td>
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
        </div>
        {project.sceneViewMode === 'grid' ? (
          <div className="scene-tile-grid">
            {project.scenes.map((scene) => (
              <div
                key={scene.id}
                className="scene-tile"
                style={{ '--tile': scene.uiColor } as React.CSSProperties}
                onClick={() => setEditingSceneId(scene.id)}
              >
                <div className="scene-tile-name">
                  {scene.name}
                  {scene.momentary && <span className="tile-hold">HOLD</span>}
                </div>
                <div className="scene-tile-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="tile-icon-btn"
                    title="Duplicate"
                    onClick={() =>
                      updateProject((p) => {
                        const copy = structuredClone(p.scenes.find((s) => s.id === scene.id)!)
                        copy.id = `scene-${Date.now()}`
                        copy.name = `${copy.name} Copy`
                        return { ...p, scenes: [...p.scenes, copy] }
                      })
                    }
                  >
                    ⧉
                  </button>
                  <button
                    className="tile-icon-btn danger"
                    title="Delete"
                    onClick={() =>
                      updateProject((p) => ({
                        ...p,
                        scenes: p.scenes.filter((s) => s.id !== scene.id),
                        padSceneIds: p.padSceneIds.map((id) => (id === scene.id ? null : id)),
                        autopilot: {
                          ...p.autopilot,
                          sceneIds: p.autopilot.sceneIds.filter((id) => id !== scene.id)
                        }
                      }))
                    }
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="scene-list">
            {project.scenes.map((scene) => (
              <div key={scene.id} className="scene-list-item">
                <span className="scene-dot" style={{ background: scene.uiColor }} />
                <span className="scene-name">{scene.name}</span>
                <button className="text-button" onClick={() => setEditingSceneId(scene.id)}>
                  Edit
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    updateProject((p) => {
                      const copy = structuredClone(p.scenes.find((s) => s.id === scene.id)!)
                      copy.id = `scene-${Date.now()}`
                      copy.name = `${copy.name} Copy`
                      return { ...p, scenes: [...p.scenes, copy] }
                    })
                  }
                >
                  Duplicate
                </button>
                <button
                  className="text-button danger"
                  onClick={() =>
                    updateProject((p) => ({
                      ...p,
                      scenes: p.scenes.filter((s) => s.id !== scene.id),
                      padSceneIds: p.padSceneIds.map((id) => (id === scene.id ? null : id)),
                      autopilot: {
                        ...p.autopilot,
                        sceneIds: p.autopilot.sceneIds.filter((id) => id !== scene.id)
                      }
                    }))
                  }
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          className="secondary-button"
          onClick={() =>
            updateProject((p) => ({
              ...p,
              scenes: [
                ...p.scenes,
                {
                  id: `scene-${Date.now()}`,
                  name: `Scene ${p.scenes.length + 1}`,
                  uiColor: '#8b5cf6',
                  targets: [{ group: 'all', color: { r: 255, g: 255, b: 255 }, dimmer: 0.8 }]
                }
              ]
            }))
          }
        >
          New Scene
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

      <SetupSection id="midi" views={['settings']} title="MIDI controller" help={<>Bind pads on any MIDI controller to scenes and live controls. Click a Learn button, hit a
          pad, done - click again to cancel a learn.</>}>
        <div className="setup-row">
          <button className="secondary-button" onClick={() => setMidiModalOpen(true)}>
            Assign MIDI Pads…
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
                    setMidiModalOpen(false)
                  }}
                >
                  Done
                </button>
              </div>
              <div className="midi-learn-grid" data-version={midiMapVersion}>
                {LEARNABLE_ACTIONS.map((entry) => {
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
                            // Second click cancels the armed learn.
                            midiPads.cancelLearn()
                            setLearningAction(null)
                            return
                          }
                          setLearningAction(entry.action)
                          midiPads.learnOnce((note) => {
                            midiPads.bind(note, entry.action)
                            setLearningAction(null)
                            setMidiMapVersion((v) => v + 1)
                          })
                        }}
                      >
                        {isLearning ? 'Cancel' : 'Learn'}
                      </button>
                    </div>
                  )
                })}
              </div>
              <button
                className="text-button danger"
                onClick={() => {
                  midiPads.unbindAll()
                  setMidiMapVersion((v) => v + 1)
                }}
              >
                Clear all MIDI bindings
              </button>
            </div>
          </div>
        )}
      </SetupSection>

      <SetupSection id="pads" title="Performance pads" help={<>Assign scenes to the pad grid used in Perform mode. Change the grid size here; you can
          also reassign any pad live from Perform with its corner menu.</>}>
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
        <div className={`pad-assign-grid cols-${padColumns(project.padCount)}`}>
          {project.padSceneIds.map((sceneId, index) => (
            <select
              key={index}
              value={sceneId ?? ''}
              onChange={(e) =>
                updateProject((p) => {
                  const padSceneIds = [...p.padSceneIds]
                  padSceneIds[index] = e.target.value || null
                  return { ...p, padSceneIds }
                })
              }
            >
              <option value="">empty</option>
              {project.scenes.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.name}
                </option>
              ))}
            </select>
          ))}
        </div>
      </SetupSection>
    </div>
    </SetupViewContext.Provider>
  )
}
