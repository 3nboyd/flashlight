import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useLightingStore } from '../../state/lightingStore'
import type { PadAction } from '../../midi/MidiPads'
import {
  audioAnalyzer,
  midiPads as midi,
  onAudioStateChange,
  startAudioListening,
  stopAudioListening
} from './runtime'
import { StageVisualizer } from './StageVisualizer'
import type { Rgbw } from '@core/lighting/engine/types'

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
  /** Scene to restore when a momentary (HOLD) pad is released. */
  const momentaryRestoreRef = useRef<string | null>(null)

  useEffect(() => onAudioStateChange(setAudioRunning), [])

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

  const handleMidiAction = useCallback(
    (action: PadAction, _velocity: number, isNoteOn: boolean) => {
      switch (action.kind) {
        case 'pad': {
          const state = useLightingStore.getState()
          const sceneId = state.project.padSceneIds[action.padIndex]
          if (!sceneId) return
          const scene = state.project.scenes.find((s) => s.id === sceneId)
          if (scene?.momentary) {
            // HOLD pads: fire on note-on, restore the previous look on note-off.
            if (isNoteOn) pressMomentary(sceneId)
            else releaseMomentary()
          } else if (isNoteOn) {
            triggerScene(sceneId)
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
      }
    },
    [triggerScene, setOverrides, pressMomentary, releaseMomentary]
  )

  useEffect(() => {
    midi.start({
      onAction: handleMidiAction,
      onDevicesChanged: setMidiDevices
    })
  }, [handleMidiAction])

  const activeSceneId = status?.activeSceneId ?? null
  const beatFlash = status ? status.beatPhase < 0.15 : false

  return (
    <div className="perform-panel">
      <div className="perform-toprow">
        <div className="bpm-block">
          <div className={`bpm-value${beatFlash ? ' on-beat' : ''}`}>
            {status ? status.bpm.toFixed(1) : '—'}
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
        </div>

        <div className="stage-mini" title="Live stage preview — click to expand">
          <StageVisualizer height={172} onBackgroundClick={() => setStageExpanded(true)} />
          <span className="stage-mini-hint">click to expand</span>
        </div>

        <div className="autopilot-block">
          <button
            className={`smart-button${status?.smartEnabled ? ' on' : ''}`}
            title="Smart Mode: automatic scene changes on phrases, builds, drops, and breakdowns — driven by OS2L + live audio"
            onClick={() => window.djCompanion.lighting.setSmartMode(!status?.smartEnabled)}
          >
            ⚡ SMART
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
          <button
            className={`audio-toggle${audioRunning ? ' on' : ''}`}
            title={
              project.audio.deviceId
                ? 'Audio-reactive effects: toggle listening to the saved audio input (works alongside OS2L)'
                : 'Pick an audio input in Setup first'
            }
            disabled={!project.audio.deviceId}
            onClick={async () => {
              if (audioRunning) await stopAudioListening()
              else if (project.audio.deviceId) await startAudioListening(project.audio.deviceId)
            }}
          >
            {audioRunning ? '● Audio On' : '○ Audio Off'}
          </button>
          {midiDevices.length > 0 && (
            <div className="midi-indicator" title={midiDevices.join(', ')}>
              ● MIDI: {midiDevices[0]}
            </div>
          )}
        </div>
      </div>

      <div className="pad-grid">
        {project.padSceneIds.map((sceneId, index) => {
          const scene = sceneId ? project.scenes.find((s) => s.id === sceneId) : null
          const isActive = scene !== null && scene !== undefined && scene.id === activeSceneId
          const momentary = scene?.momentary === true
          return (
            <button
              key={index}
              className={`pad${isActive ? ' active' : ''}${scene ? '' : ' empty'}`}
              style={scene ? ({ '--pad-color': scene.uiColor } as React.CSSProperties) : undefined}
              onClick={momentary ? undefined : () => scene && triggerScene(isActive ? null : scene.id)}
              onMouseDown={momentary && scene ? () => pressMomentary(scene.id) : undefined}
              onMouseUp={momentary ? releaseMomentary : undefined}
              onMouseLeave={momentary && isActive ? releaseMomentary : undefined}
            >
              {scene ? scene.name : ''}
              {momentary && <span className="hold-tag pad-hold">HOLD</span>}
            </button>
          )
        })}
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

        <button
          className={`strobe-button${overrides.strobe ? ' held' : ''}`}
          onMouseDown={() => setOverrides({ strobe: true })}
          onMouseUp={() => setOverrides({ strobe: false })}
          onMouseLeave={() => overrides.strobe && setOverrides({ strobe: false })}
        >
          STROBE
        </button>
        <button
          className={`blackout-button${overrides.blackout ? ' engaged' : ''}`}
          onClick={() => setOverrides({ blackout: !overrides.blackout })}
        >
          BLACKOUT
        </button>
      </div>

      {stageExpanded && (
        <div className="stage-overlay" onClick={() => setStageExpanded(false)}>
          <div className="stage-overlay-panel" onClick={(e) => e.stopPropagation()}>
            <div className="stage-overlay-header">
              <h2>Stage</h2>
              <span className="settings-hint" style={{ margin: 0 }}>
                Drag fixtures to arrange your rig — up to the truss, down to the floor.
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
