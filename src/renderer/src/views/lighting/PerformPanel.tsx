import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useLightingStore } from '../../state/lightingStore'
import { AudioAnalyzer, type AnalyzerFrame } from '../../audio/AudioAnalyzer'
import type { PadAction } from '../../midi/MidiPads'
import { audioAnalyzer as analyzer, midiPads as midi } from './runtime'
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
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [audioDeviceId, setAudioDeviceId] = useState<string>('')
  const [audioRunning, setAudioRunning] = useState(analyzer.isRunning())
  const [levels, setLevels] = useState({ rms: 0, bass: 0, mid: 0, high: 0 })
  const [midiDevices, setMidiDevices] = useState<string[]>([])
  const lastMeterUpdateRef = useRef(0)

  useEffect(() => {
    const interval = setInterval(refreshStatus, 250)
    return () => clearInterval(interval)
  }, [refreshStatus])

  useEffect(() => {
    AudioAnalyzer.listInputDevices().then(setAudioDevices)
  }, [])

  const handleMidiAction = useCallback(
    (action: PadAction, _velocity: number, isNoteOn: boolean) => {
      switch (action.kind) {
        case 'pad': {
          if (!isNoteOn) return
          const sceneId = useLightingStore.getState().project.padSceneIds[action.padIndex]
          if (sceneId) triggerScene(sceneId)
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
    [triggerScene, setOverrides]
  )

  useEffect(() => {
    midi.start({
      onAction: handleMidiAction,
      onDevicesChanged: setMidiDevices
    })
  }, [handleMidiAction])

  async function toggleAudio(): Promise<void> {
    if (audioRunning) {
      await analyzer.stop()
      setAudioRunning(false)
      return
    }
    if (!audioDeviceId) return
    await analyzer.start(audioDeviceId, (frame: AnalyzerFrame) => {
      window.djCompanion.lighting.sendAudioFeatures(frame)
      // Update the on-screen meters at ~10fps to avoid re-render storms;
      // the engine still receives every frame above.
      if (frame.timestampMs - lastMeterUpdateRef.current > 90) {
        lastMeterUpdateRef.current = frame.timestampMs
        setLevels({ rms: frame.rms, bass: frame.bass, mid: frame.mid, high: frame.high })
      }
    })
    setAudioRunning(true)
  }

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

        <div className="audio-block">
          <div className="audio-row">
            <select
              value={audioDeviceId}
              onChange={(e) => setAudioDeviceId(e.target.value)}
              disabled={audioRunning}
            >
              <option value="">Select audio input (virtual cable)…</option>
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Input ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
            <button className={audioRunning ? 'danger-button' : 'primary-button'} onClick={toggleAudio}>
              {audioRunning ? 'Stop Audio' : 'Listen'}
            </button>
          </div>
          <div className="meters">
            {(
              [
                ['Bass', levels.bass],
                ['Mid', levels.mid],
                ['High', levels.high],
                ['Vol', levels.rms]
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="meter">
                <div className="meter-track">
                  <div className="meter-fill" style={{ height: `${Math.round(value * 100)}%` }} />
                </div>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <label className="perform-check">
            <input
              type="checkbox"
              defaultChecked
              onChange={(e) => window.djCompanion.lighting.setBpmFollowsAudio(e.target.checked)}
            />
            BPM follows audio
          </label>
        </div>

        <div className="autopilot-block">
          <label className="perform-check">
            <input
              type="checkbox"
              checked={project.autopilot.enabled}
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
          return (
            <button
              key={index}
              className={`pad${isActive ? ' active' : ''}${scene ? '' : ' empty'}`}
              style={scene ? ({ '--pad-color': scene.uiColor } as React.CSSProperties) : undefined}
              onClick={() => scene && triggerScene(isActive ? null : scene.id)}
            >
              {scene ? scene.name : ''}
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
    </div>
  )
}
