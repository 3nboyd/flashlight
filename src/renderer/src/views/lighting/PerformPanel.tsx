import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useLightingStore } from '../../state/lightingStore'
import type { ControlAction, PadAction } from '../../midi/MidiPads'
import {
  audioAnalyzer,
  midiPads as midi,
  onAudioStateChange,
  onAudioFrame,
  startAudioListening,
  stopAudioListening
} from './runtime'
import { AudioAnalyzer } from '../../audio/AudioAnalyzer'
import { StageVisualizer } from './StageVisualizer'
import { Knob } from './Knob'
import { SceneBrowser } from './SceneBrowser'
import { SceneEditorModal } from './SceneEditorModal'
import { padColumns } from './padGrid'
import { parsePadFunction, padFunctionInfo, type PadFunctionKind } from './padFunctions'
import { DEFAULT_MELODY_SENSITIVITY, type Rgbw } from '@core/lighting/engine/types'

const OVERRIDE_COLORS: { name: string; color: Rgbw | null; css: string }[] = [
  { name: 'Off', color: null, css: 'transparent' },
  { name: 'Red', color: { r: 255, g: 0, b: 0 }, css: '#f00' },
  { name: 'Orange', color: { r: 255, g: 100, b: 0 }, css: '#f80' },
  { name: 'Yellow', color: { r: 255, g: 220, b: 0 }, css: '#fd0' },
  { name: 'Green', color: { r: 0, g: 255, b: 40 }, css: '#0f4' },
  { name: 'Cyan', color: { r: 0, g: 220, b: 255 }, css: '#0df' },
  { name: 'Blue', color: { r: 0, g: 60, b: 255 }, css: '#04f' },
  { name: 'Purple', color: { r: 150, g: 0, b: 255 }, css: '#90f' },
  { name: 'Pink', color: { r: 255, g: 0, b: 180 }, css: '#f0b' },
  { name: 'White', color: { r: 255, g: 255, b: 255, w: 255 }, css: '#fff' }
]

export function PerformPanel(): JSX.Element {
  const { project, status, refreshStatus, triggerScene, setOverrides, overrides, updateProject } =
    useLightingStore()
  const [midiDevices, setMidiDevices] = useState<string[]>([])
  const [stageExpanded, setStageExpanded] = useState(false)
  const [audioRunning, setAudioRunning] = useState(audioAnalyzer.isRunning())
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [levels, setLevels] = useState({ rms: 0, bass: 0, mid: 0, high: 0 })
  const lastMeterRef = useRef(0)
  /** Pad index whose reassign browser is open (null = none). */
  const [reassignPad, setReassignPad] = useState<number | null>(null)
  /** The pad whose corner (three-dot) menu is open, anchored at x/y. */
  const [padMenu, setPadMenu] = useState<{ index: number; x: number; y: number } | null>(null)
  /** Scene being edited from a pad's menu (opens the full scene editor). */
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)
  /** Scene to restore when a momentary (HOLD) pad is released. */
  const momentaryRestoreRef = useRef<string | null>(null)

  useEffect(() => onAudioStateChange(setAudioRunning), [])

  // Live input meter + device list, so the operator can see the audio feed and
  // change the input right here in the lighting panel (mirrors Settings).
  useEffect(() => {
    const offFrame = onAudioFrame((frame) => {
      if (frame.timestampMs - lastMeterRef.current > 90) {
        lastMeterRef.current = frame.timestampMs
        setLevels({ rms: frame.rms, bass: frame.bass, mid: frame.mid, high: frame.high })
      }
    })
    AudioAnalyzer.listInputDevices().then(setAudioDevices)
    return offFrame
  }, [])

  const selectAudioDevice = useCallback(
    async (deviceId: string): Promise<void> => {
      const label = audioDevices.find((d) => d.deviceId === deviceId)?.label ?? null
      await updateProject((p) => ({
        ...p,
        audio: { ...p.audio, deviceId: deviceId || null, deviceLabel: label }
      }))
      if (deviceId && audioAnalyzer.isRunning()) await startAudioListening(deviceId)
    },
    [audioDevices, updateProject]
  )
  const toggleAudio = useCallback(async (): Promise<void> => {
    if (audioRunning) return stopAudioListening()
    if (project.audio.deviceId) await startAudioListening(project.audio.deviceId)
  }, [audioRunning, project.audio.deviceId])

  const assignPad = useCallback(
    (index: number, sceneId: string | null) => {
      updateProject((p) => {
        const padSceneIds = [...p.padSceneIds]
        padSceneIds[index] = sceneId
        return { ...p, padSceneIds }
      })
      setReassignPad(null)
    },
    [updateProject]
  )

  const pressMomentary = useCallback(
    (sceneId: string) => {
      momentaryRestoreRef.current = useLightingStore.getState().status?.activeSceneId ?? null
      triggerScene(sceneId)
    },
    [triggerScene]
  )

  const releaseMomentary = useCallback(() => {
    triggerScene(momentaryRestoreRef.current)
    momentaryRestoreRef.current = null
  }, [triggerScene])

  useEffect(() => {
    const interval = setInterval(refreshStatus, 250)
    return () => clearInterval(interval)
  }, [refreshStatus])

  useEffect(() => {
    if (!stageExpanded) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setStageExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stageExpanded])

  // A pad assigned a control function. `on` is press/hold (true) or release
  // (false); momentary functions use both, the rest act on press only.
  // Cycles the live color override through the project's favorite colors, driven
  // by MIDI buttons (next/prev) and knobs (position). The host reverts it on a
  // scene switch unless "remember color" is on.
  const colorIdxRef = useRef(-1)
  const applyFavColor = useCallback(
    (idx: number) => {
      const favs = useLightingStore.getState().project.favoriteColors ?? []
      if (favs.length === 0) return
      const i = ((idx % favs.length) + favs.length) % favs.length
      colorIdxRef.current = i
      setOverrides({ colorOverride: favs[i] })
    },
    [setOverrides]
  )

  const firePadFunction = useCallback(
    (kind: PadFunctionKind, on: boolean) => {
      switch (kind) {
        case 'colorNext':
          if (on) applyFavColor(colorIdxRef.current + 1)
          break
        case 'colorPrev':
          if (on) applyFavColor(colorIdxRef.current - 1)
          break
        case 'strobe':
          setOverrides({ strobe: on })
          break
        case 'blinder':
          setOverrides({ blind: on })
          break
        case 'blackout':
          if (on) setOverrides({ blackout: !useLightingStore.getState().overrides.blackout })
          break
        case 'manual':
          if (on) window.djCompanion.lighting.manualPulse().then(refreshStatus)
          break
        case 'tap':
          if (on) window.djCompanion.lighting.tapTempo()
          break
        case 'resync':
          if (on) window.djCompanion.lighting.resyncDownbeat()
          break
        case 'autopilot':
          if (on)
            updateProject((p) => ({
              ...p,
              autopilot: { ...p.autopilot, enabled: !p.autopilot.enabled }
            }))
          break
      }
    },
    [setOverrides, refreshStatus, updateProject, applyFavColor]
  )

  const handleMidiAction = useCallback(
    (action: PadAction, _velocity: number, isNoteOn: boolean) => {
      switch (action.kind) {
        case 'pad': {
          const state = useLightingStore.getState()
          const value = state.project.padSceneIds[action.padIndex]
          const fnKind = parsePadFunction(value)
          if (fnKind) {
            firePadFunction(fnKind, isNoteOn)
            break
          }
          if (!value) return
          const scene = state.project.scenes.find((s) => s.id === value)
          if (scene?.momentary) {
            // HOLD pads: fire on note-on, restore the previous look on note-off.
            if (isNoteOn) pressMomentary(value)
            else releaseMomentary()
          } else if (isNoteOn) {
            // Tap Pulse from a MIDI pad: activate it on the first hit, then fire
            // a flash on every hit so the DJ can tap their own rhythm (matching
            // the on-screen pad), instead of just re-triggering the scene.
            if (scene?.targets.some((t) => t.effect?.type === 'tapPulse')) {
              if (state.status?.activeSceneId !== value) triggerScene(value)
              window.djCompanion.lighting.manualPulse()
            } else {
              triggerScene(value)
            }
          }
          break
        }
        case 'blackout':
          if (isNoteOn) {
            setOverrides({ blackout: !useLightingStore.getState().overrides.blackout })
          }
          break
        case 'strobe':
          setOverrides({ strobe: isNoteOn }) // momentary: on while held
          break
        case 'tap':
          if (isNoteOn) window.djCompanion.lighting.tapTempo()
          break
        case 'resync':
          if (isNoteOn) window.djCompanion.lighting.resyncDownbeat()
          break
        case 'autopilot':
          if (isNoteOn) {
            const current = useLightingStore.getState().project
            useLightingStore.getState().updateProject((p) => ({
              ...p,
              autopilot: { ...p.autopilot, enabled: !current.autopilot.enabled }
            }))
          }
          break
        case 'manual':
          if (isNoteOn) window.djCompanion.lighting.manualPulse()
          break
      }
    },
    [triggerScene, setOverrides, pressMomentary, releaseMomentary, firePadFunction]
  )

  const handleMidiControl = useCallback(
    (action: ControlAction, value: number) => {
      const v = value / 127 // 0..1
      switch (action.kind) {
        case 'masterDimmer':
          setOverrides({ masterDimmer: v })
          break
        case 'pan':
          setOverrides({ panOffset: v * 2 - 1 })
          break
        case 'tilt':
          setOverrides({ tiltOffset: v * 2 - 1 })
          break
        case 'speed':
          setOverrides({ movementSpeed: 0.25 + v * 3.75 })
          break
        case 'reactivity':
          setOverrides({ reactivity: v * 2 })
          break
        case 'colorPick': {
          // Fader at the very bottom (0%) or top (100%) reverts to each scene's
          // own default color; the interior sweeps across the favorite colors.
          if (v <= 0.02 || v >= 0.98) {
            colorIdxRef.current = -1
            setOverrides({ colorOverride: null })
            break
          }
          const favs = useLightingStore.getState().project.favoriteColors ?? []
          if (favs.length > 0) {
            const t = (v - 0.02) / 0.96 // remap so the first/last favorite stay reachable
            applyFavColor(Math.round(t * (favs.length - 1)))
          }
          break
        }
      }
    },
    [setOverrides, applyFavColor]
  )

  useEffect(() => {
    midi.start({
      onAction: handleMidiAction,
      onControl: handleMidiControl,
      onDevicesChanged: setMidiDevices
    })
  }, [handleMidiAction, handleMidiControl])

  const activeSceneId = status?.activeSceneId ?? null
  const beatFlash = status ? status.beatPhase < 0.15 : false

  return (
    <div className="perform-panel">
      <div className="perform-toprow">
        <div className="bpm-block">
          <div className={`bpm-value${beatFlash ? ' on-beat' : ''}`}>
            {status ? status.bpm.toFixed(1) : '-'}
          </div>
          <div className="bpm-label">BPM</div>
          <div
            className={`beat-source-badge ${status?.beatSource ?? 'manual'}`}
            title={
              status?.beatSource === 'os2l'
                ? 'Beat grid streamed live from your DJ software over OS2L'
                : status?.beatSource === 'audio'
                  ? 'Tempo estimated from the live audio input'
                  : 'Manual tempo (tap or type a BPM)'
            }
          >
            {status?.beatSource === 'os2l' ? '● OS2L' : status?.beatSource === 'audio' ? '● Audio' : '○ Manual'}
          </div>
          <div className="bpm-controls">
            <button className="secondary-button" onClick={() => window.djCompanion.lighting.tapTempo()}>
              Tap
            </button>
            <button
              className="secondary-button"
              title="Snap the downbeat to now"
              onClick={() => window.djCompanion.lighting.resyncDownbeat()}
            >
              Sync 1
            </button>
          </div>
          <div className="bpm-manual-row">
            <button
              className="secondary-button"
              title="Nudge BPM down (takes manual control)"
              onClick={() => status && window.djCompanion.lighting.setBpm(Math.round((status.bpm - 1) * 10) / 10)}
            >
              −
            </button>
            <input
              className="bpm-manual-input"
              type="number"
              min={20}
              max={300}
              step={0.1}
              placeholder="BPM"
              title="Type a BPM for manual takeover"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const value = Number((e.target as HTMLInputElement).value)
                  if (value >= 20 && value <= 300) {
                    window.djCompanion.lighting.setBpm(value)
                    ;(e.target as HTMLInputElement).value = ''
                  }
                }
              }}
            />
            <button
              className="secondary-button"
              title="Nudge BPM up (takes manual control)"
              onClick={() => status && window.djCompanion.lighting.setBpm(Math.round((status.bpm + 1) * 10) / 10)}
            >
              +
            </button>
          </div>
          <div
            className={`midi-indicator${midiDevices.length ? '' : ' none'}`}
            title={
              midiDevices.length
                ? midiDevices.join(', ')
                : 'No MIDI controller detected. Check it is plugged in; if it still shows none, unplug/replug or restart the app.'
            }
          >
            {midiDevices.length ? `● MIDI: ${midiDevices[0]}` : '○ No MIDI detected'}
          </div>

          <div className="bpm-audio">
            <div className="bpm-audio-head">
              <span
                className={`bpm-audio-dot ${audioRunning ? (levels.rms > 0.008 ? 'live' : 'idle') : 'off'}`}
              />
              <span className="bpm-audio-label">
                {audioRunning ? (levels.rms > 0.008 ? 'Audio in' : 'No signal') : 'Audio off'}
              </span>
              <button
                className={audioRunning ? 'danger-button' : 'secondary-button'}
                onClick={toggleAudio}
                disabled={!audioRunning && !project.audio.deviceId}
                title="Start/stop listening to the audio input"
              >
                {audioRunning ? 'Stop' : 'Listen'}
              </button>
            </div>
            <div className="bpm-eq" title="Live input — bass / mid / high / volume">
              {[levels.bass, levels.mid, levels.high, levels.rms].map((v, i) => (
                <div key={i} className="bpm-eq-bar">
                  <div
                    className="bpm-eq-fill"
                    style={{ height: `${Math.round(Math.min(1, v) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <select
              className="bpm-audio-select"
              value={project.audio.deviceId ?? ''}
              onChange={(e) => selectAudioDevice(e.target.value)}
              title="Audio input device for beat/energy detection"
            >
              <option value="">Audio input…</option>
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Input ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="stage-mini" title="Live stage preview - click to expand">
          <StageVisualizer height={248} fitContent onBackgroundClick={() => setStageExpanded(true)} />
          <span className="stage-mini-hint">click to expand</span>
        </div>

        <div className="autopilot-block">
          <button
            className={`smart-button${status?.smartEnabled ? ' on' : ''}`}
            title="Smart Mode: automatic scene changes on phrases, builds, drops, and breakdowns - driven by OS2L + live audio"
            onClick={() => window.djCompanion.lighting.setSmartMode(!status?.smartEnabled)}
          >
            SMART
          </button>
          {status?.smartEnabled && (
            <div className={`smart-phase ${status.smartPhase}`}>
              {status.smartPhase === 'build'
                ? `BUILD ${Math.round(status.smartBuildProgress * 100)}%`
                : status.smartPhase.toUpperCase()}
            </div>
          )}
          {status?.smartEnabled && !audioRunning && (
            <div className="smart-warning">needs Audio On for energy detection</div>
          )}
          <label className="perform-check">
            <input
              type="checkbox"
              checked={project.autopilot.enabled}
              disabled={status?.smartEnabled}
              title={status?.smartEnabled ? 'Smart Mode is driving scene changes' : undefined}
              onChange={(e) =>
                updateProject((p) => ({
                  ...p,
                  autopilot: { ...p.autopilot, enabled: e.target.checked }
                }))
              }
            />
            Autopilot
          </label>
          <div className="autopilot-bars">
            every
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
            bars
          </div>
          <div className="autopilot-now" title="Scene playing right now">
            <span className="autopilot-now-label">Now</span>
            <span className="autopilot-now-scene">
              {project.scenes.find((s) => s.id === activeSceneId)?.name ?? '-'}
            </span>
          </div>
        </div>
      </div>


      <div className={`pad-grid cols-${padColumns(project.padCount)}`}>
        {project.padSceneIds.map((sceneId, index) => {
          const fnKind = parsePadFunction(sceneId)
          if (fnKind) {
            const info = padFunctionInfo(fnKind)
            const fnActive =
              (fnKind === 'blackout' && overrides.blackout) ||
              (fnKind === 'strobe' && overrides.strobe) ||
              (fnKind === 'blinder' && overrides.blind) ||
              (fnKind === 'manual' && status?.manualActive === true) ||
              (fnKind === 'autopilot' && project.autopilot.enabled)
            return (
              <div
                key={index}
                className={`pad pad-fn${fnActive ? ' active' : ''}`}
                style={{ '--pad-color': info.uiColor } as React.CSSProperties}
                title={info.hint}
                onMouseDown={() => firePadFunction(fnKind, true)}
                onMouseUp={() => firePadFunction(fnKind, false)}
                onMouseLeave={() => info.momentary && firePadFunction(fnKind, false)}
              >
                <span className="pad-name">{info.label}</span>
                {info.momentary && <span className="hold-tag pad-hold">HOLD</span>}
                <button
                  className="pad-menu-btn"
                  title="Reassign this pad"
                  onClick={(e) => {
                    e.stopPropagation()
                    setReassignPad(index)
                  }}
                >
                  <span />
                  <span />
                  <span />
                </button>
              </div>
            )
          }
          const scene = sceneId ? project.scenes.find((s) => s.id === sceneId) : null
          const isActive = scene !== null && scene !== undefined && scene.id === activeSceneId
          const momentary = scene?.momentary === true
          if (!scene) {
            return (
              <button
                key={index}
                className="pad empty"
                title="Assign a scene or control"
                onClick={() => setReassignPad(index)}
              >
                <span className="pad-plus">+</span>
              </button>
            )
          }
          return (
            <div
              key={index}
              className={`pad${isActive ? ' active' : ''}`}
              style={{ '--pad-color': scene.uiColor } as React.CSSProperties}
              onClick={
                momentary
                  ? undefined
                  : scene.targets.some((t) => t.effect?.type === 'tapPulse')
                    ? () => {
                        // Tap Pulse pad: first press activates it, each press
                        // fires a flash (rather than toggling the scene off).
                        if (!isActive) triggerScene(scene.id)
                        window.djCompanion.lighting.manualPulse().then(refreshStatus)
                      }
                    : () => triggerScene(isActive ? null : scene.id)
              }
              onMouseDown={momentary ? () => pressMomentary(scene.id) : undefined}
              onMouseUp={momentary ? releaseMomentary : undefined}
              onMouseLeave={momentary && isActive ? releaseMomentary : undefined}
            >
              <span className="pad-name">{scene.name}</span>
              {momentary && <span className="hold-tag pad-hold">HOLD</span>}
              <button
                className="pad-menu-btn"
                title="Reassign this pad"
                onClick={(e) => {
                  e.stopPropagation()
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setPadMenu({ index, x: r.right, y: r.bottom })
                }}
              >
                <span />
                <span />
                <span />
              </button>
            </div>
          )
        })}
      </div>

      {reassignPad !== null && (
        <SceneBrowser
          scenes={project.scenes}
          title={`Assign pad ${reassignPad + 1}`}
          currentId={project.padSceneIds[reassignPad]}
          includeControls
          onPick={(id) => assignPad(reassignPad, id)}
          onClear={
            project.padSceneIds[reassignPad] ? () => assignPad(reassignPad, null) : undefined
          }
          onClose={() => setReassignPad(null)}
        />
      )}
      {padMenu &&
        (() => {
          const value = project.padSceneIds[padMenu.index]
          const isFn = parsePadFunction(value) !== null
          const scene = !isFn && value ? project.scenes.find((s) => s.id === value) : null
          return (
            <>
              <div className="pad-corner-backdrop" onClick={() => setPadMenu(null)} />
              <div className="pad-corner-menu" style={{ left: padMenu.x, top: padMenu.y }}>
                {scene && (
                  <button
                    onClick={() => {
                      setEditingSceneId(scene.id)
                      setPadMenu(null)
                    }}
                  >
                    Edit scene
                  </button>
                )}
                <button
                  onClick={() => {
                    setReassignPad(padMenu.index)
                    setPadMenu(null)
                  }}
                >
                  Reassign…
                </button>
                {value && (
                  <button
                    className="danger"
                    onClick={() => {
                      assignPad(padMenu.index, null)
                      setPadMenu(null)
                    }}
                  >
                    Clear pad
                  </button>
                )}
              </div>
            </>
          )
        })()}

      {editingSceneId &&
        (() => {
          const scene = project.scenes.find((s) => s.id === editingSceneId)
          if (!scene) return null
          return (
            <SceneEditorModal
              scene={scene}
              onChange={(updated) =>
                updateProject((p) => ({
                  ...p,
                  scenes: p.scenes.map((s) => (s.id === updated.id ? updated : s))
                }))
              }
              onClose={() => setEditingSceneId(null)}
            />
          )
        })()}

      <div className="perform-knobs">
        <Knob
          label="Pan"
          value={overrides.panOffset}
          min={-1}
          max={1}
          resetValue={0}
          format={(v) => (Math.abs(v) < 0.02 ? 'center' : `${v > 0 ? 'R' : 'L'} ${Math.round(Math.abs(v) * 100)}`)}
          onChange={(v) => setOverrides({ panOffset: v })}
        />
        <Knob
          label="Tilt"
          value={overrides.tiltOffset}
          min={-1}
          max={1}
          resetValue={0}
          format={(v) => (Math.abs(v) < 0.02 ? 'center' : `${v > 0 ? '↑' : '↓'} ${Math.round(Math.abs(v) * 100)}`)}
          onChange={(v) => setOverrides({ tiltOffset: v })}
        />
        <Knob
          label="Speed"
          value={overrides.movementSpeed}
          min={0.25}
          max={4}
          resetValue={1}
          format={(v) => `${v.toFixed(2)}x`}
          onChange={(v) => setOverrides({ movementSpeed: v })}
        />
        <Knob
          label="Sensitivity"
          value={overrides.reactivity}
          min={0}
          max={2}
          resetValue={1}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => setOverrides({ reactivity: v })}
        />
        <Knob
          label="Echo"
          value={project.melodySensitivity ?? DEFAULT_MELODY_SENSITIVITY}
          min={0}
          max={1}
          resetValue={DEFAULT_MELODY_SENSITIVITY}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => updateProject((p) => ({ ...p, melodySensitivity: v }))}
        />
        <div className="perform-knobs-macros">
          <button
            className={`strobe-button${overrides.strobe ? ' held' : ''}`}
            onMouseDown={() => setOverrides({ strobe: true })}
            onMouseUp={() => setOverrides({ strobe: false })}
            onMouseLeave={() => overrides.strobe && setOverrides({ strobe: false })}
          >
            STROBE
          </button>
          <div className="blackout-group">
            <button
              className={`blackout-button${overrides.blackout ? ' engaged' : ''}`}
              onClick={() => setOverrides({ blackout: !overrides.blackout })}
            >
              BLACKOUT
            </button>
            <button
              className="blackout-mode"
              title={
                project.blackoutHolds === false
                  ? 'Blackout clears when you pick a scene. Click to make it stay on instead.'
                  : 'Blackout stays on when you pick a scene. Click to make scenes clear it.'
              }
              onClick={() =>
                updateProject((p) => ({ ...p, blackoutHolds: p.blackoutHolds === false }))
              }
            >
              {project.blackoutHolds === false ? 'clears on scene' : 'stays on'}
            </button>
          </div>
        </div>
      </div>

      <div className="perform-bottombar">
        <div className="master-dimmer">
          <span>Master</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(overrides.masterDimmer * 100)}
            onChange={(e) => setOverrides({ masterDimmer: Number(e.target.value) / 100 })}
          />
          <span className="master-value">{Math.round(overrides.masterDimmer * 100)}%</span>
        </div>

        <div className="override-colors">
          {OVERRIDE_COLORS.map((entry) => {
            const isSelected =
              (entry.color === null && overrides.colorOverride === null) ||
              (entry.color !== null &&
                overrides.colorOverride !== null &&
                entry.color.r === overrides.colorOverride.r &&
                entry.color.g === overrides.colorOverride.g &&
                entry.color.b === overrides.colorOverride.b)
            return (
              <button
                key={entry.name}
                className={`override-swatch${isSelected ? ' selected' : ''}${entry.color === null ? ' none' : ''}`}
                style={{ background: entry.css }}
                title={entry.name}
                onClick={() => setOverrides({ colorOverride: entry.color })}
              />
            )
          })}
        </div>
      </div>

      {stageExpanded && (
        <div className="stage-overlay" onClick={() => setStageExpanded(false)}>
          <div className="stage-overlay-panel" onClick={(e) => e.stopPropagation()}>
            <div className="stage-overlay-header">
              <h2>Stage</h2>
              <span className="settings-hint" style={{ margin: 0 }}>
                Drag fixtures to arrange your rig - up to the truss, down to the floor.
              </span>
              <button className="secondary-button" onClick={() => setStageExpanded(false)}>
                Close (Esc)
              </button>
            </div>
            <StageVisualizer height={Math.min(560, window.innerHeight - 220)} editable />
          </div>
        </div>
      )}
    </div>
  )
}
