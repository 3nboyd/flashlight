import { useEffect, type JSX } from 'react'
import type { CameraRole } from '@core/camera/roles'
import { ROLE_LABEL } from '@core/camera/roles'
import type { DirectorSettings } from '../../camera/directorSettings'
import './DirectorSettingsPanel.css'

export interface DirectorCameraRow {
  deviceId: string
  label: string
  role: CameraRole
  lookSwitch: boolean
  priority: number
}

const PRIORITY_OPTIONS: { value: number; label: string }[] = [
  { value: 2, label: 'Most used' },
  { value: 1.4, label: 'More' },
  { value: 1, label: 'Equal' },
  { value: 0.7, label: 'Less' },
  { value: 0.4, label: 'Least used' }
]

/**
 * Settings for the auto-director cut. Everything is always visible; sections
 * whose master toggle is off are shown greyed/disabled rather than hidden.
 */
export function DirectorSettingsPanel({
  settings,
  onChange,
  cameras,
  onLookSwitch,
  onPriority,
  onAllEqual,
  effectOptions,
  display,
  onDisplay,
  aspects,
  onClose
}: {
  settings: DirectorSettings
  onChange: (s: DirectorSettings) => void
  cameras: DirectorCameraRow[]
  onLookSwitch: (deviceId: string, on: boolean) => void
  onPriority: (deviceId: string, priority: number) => void
  onAllEqual: () => void
  effectOptions: { id: string; name: string }[]
  display: { aspect: string; fit: 'fit' | 'fill' }
  onDisplay: (d: { aspect: string; fit: 'fit' | 'fill' }) => void
  aspects: { id: string; label: string }[]
  onClose: () => void
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (patch: Partial<DirectorSettings>): void => onChange({ ...settings, ...patch })
  const setDrop = (patch: Partial<DirectorSettings['drop']>): void =>
    onChange({ ...settings, drop: { ...settings.drop, ...patch } })

  const decisiveness = Math.max(0, Math.min(1, 1 - (settings.hysteresis - 0.05) / 0.5))
  const toggleEffect = (id: string): void => {
    const has = settings.drop.effects.includes(id)
    setDrop({
      effects: has ? settings.drop.effects.filter((e) => e !== id) : [...settings.drop.effects, id]
    })
  }
  const dropOff = !settings.drop.enabled

  return (
    <div className="director-overlay" onClick={onClose}>
      <div className="director-panel" onClick={(e) => e.stopPropagation()}>
        <div className="director-head">
          <h2>Auto-director (Beta)</h2>
          <button className="secondary-button" onClick={onClose}>
            Close (Esc)
          </button>
        </div>
        <p className="settings-hint">
          Controls how the recording auto-cuts between your cameras. Nothing here changes what you
          see live on the screen.
        </p>

        <div className="director-cols">
          {/* Left column: frame + timing + cameras ------------------------- */}
          <div className="director-col">
            <section className="director-sec">
              <div className="director-sec-title">Camera frame (applies to all)</div>
              <label className="director-row">
                <span className="director-row-label">Aspect ratio</span>
                <select
                  value={display.aspect}
                  onChange={(e) => onDisplay({ ...display, aspect: e.target.value })}
                >
                  {aspects.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="director-row">
                <span className="director-row-label">When the camera doesn&apos;t match</span>
                <select
                  value={display.fit}
                  onChange={(e) =>
                    onDisplay({ ...display, fit: e.target.value as 'fit' | 'fill' })
                  }
                >
                  <option value="fill">Fill (zoom in, no black bars)</option>
                  <option value="fit">Fit (show all, black bars)</option>
                </select>
              </label>
            </section>

            <section className="director-sec">
              <div className="director-sec-title">Timing</div>
              <label className="director-row">
                <span className="director-row-label">
                  Average shot length
                  <em>{(settings.avgHoldMs / 1000).toFixed(1)}s</em>
                </span>
                <input
                  type="range"
                  min={1500}
                  max={15000}
                  step={500}
                  value={settings.avgHoldMs}
                  onChange={(e) => set({ avgHoldMs: Number(e.target.value) })}
                />
                <span className="director-row-ends">
                  <span>quick cuts</span>
                  <span>long takes</span>
                </span>
              </label>

              <label className="director-row">
                <span className="director-row-label">Switching eagerness</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={decisiveness}
                  onChange={(e) => set({ hysteresis: 0.05 + (1 - Number(e.target.value)) * 0.5 })}
                />
                <span className="director-row-ends">
                  <span>hold the shot</span>
                  <span>cut readily</span>
                </span>
              </label>

              <label className="director-check">
                <input
                  type="checkbox"
                  checked={settings.switchOnBeat}
                  onChange={(e) => set({ switchOnBeat: e.target.checked })}
                />
                <span>
                  Switch on the beat
                  <em>cuts land on the beat instead of any moment</em>
                </span>
              </label>
            </section>

            <section className="director-sec">
              <div className="director-sec-head">
                <div className="director-sec-title">Cameras</div>
                <button className="text-button" onClick={onAllEqual}>
                  All equal
                </button>
              </div>
              {cameras.length === 0 ? (
                <p className="settings-hint">Enable cameras to prioritize them here.</p>
              ) : (
                cameras.map((c) => (
                  <div key={c.deviceId} className="director-cam">
                    <div className="director-cam-name">
                      {c.label || 'Camera'} <em>{ROLE_LABEL[c.role]}</em>
                    </div>
                    <div className="director-cam-controls">
                      <select
                        value={PRIORITY_OPTIONS.reduce((a, o) =>
                          Math.abs(o.value - c.priority) < Math.abs(a.value - c.priority) ? o : a
                        ).value}
                        title="How much the director uses this camera"
                        onChange={(e) => onPriority(c.deviceId, Number(e.target.value))}
                      >
                        {PRIORITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <label className="director-cam-look" title="Cut here when the DJ looks at it">
                        <input
                          type="checkbox"
                          checked={c.lookSwitch}
                          onChange={(e) => onLookSwitch(c.deviceId, e.target.checked)}
                        />
                        look = cut
                      </label>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>

          {/* Right column: beat-drop effect -------------------------------- */}
          <div className="director-col">
            <section className="director-sec">
              <label className="director-check">
                <input
                  type="checkbox"
                  checked={settings.drop.enabled}
                  onChange={(e) => setDrop({ enabled: e.target.checked })}
                />
                <span>
                  Effect on the drop (Beta)
                  <em>fire a camera effect for a moment when the music drops</em>
                </span>
              </label>

              <div className={`director-subgroup${dropOff ? ' director-disabled' : ''}`}>
                <label className="director-row">
                  <span className="director-row-label">
                    Effect duration
                    <em>{(settings.drop.durationMs / 1000).toFixed(1)}s</em>
                  </span>
                  <input
                    type="range"
                    min={1000}
                    max={8000}
                    step={500}
                    disabled={dropOff}
                    value={settings.drop.durationMs}
                    onChange={(e) => setDrop({ durationMs: Number(e.target.value) })}
                  />
                </label>
                <div className="director-sec-title">Allowed effects (one is picked per drop)</div>
                <div className="director-fx-grid">
                  {effectOptions.map((fx) => (
                    <label key={fx.id} className="director-fx">
                      <input
                        type="checkbox"
                        disabled={dropOff}
                        checked={settings.drop.effects.includes(fx.id)}
                        onChange={() => toggleEffect(fx.id)}
                      />
                      <span>{fx.name}</span>
                    </label>
                  ))}
                </div>
                {!dropOff && settings.drop.effects.length === 0 && (
                  <p className="settings-hint">Pick at least one effect for the drop to use.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
