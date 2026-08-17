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
}

/**
 * Settings for the auto-director cut. Everything that controls how fast/how much
 * the program switches cameras, which cameras cut on being looked at, on-beat
 * quantizing, and the beat-drop effect - in one place.
 */
export function DirectorSettingsPanel({
  settings,
  onChange,
  cameras,
  onLookSwitch,
  effectOptions,
  onClose
}: {
  settings: DirectorSettings
  onChange: (s: DirectorSettings) => void
  cameras: DirectorCameraRow[]
  onLookSwitch: (deviceId: string, on: boolean) => void
  effectOptions: { id: string; name: string }[]
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

  // Decisiveness slider: 0 = hold shots, 1 = cut readily (inverse of hysteresis).
  const decisiveness = Math.max(0, Math.min(1, 1 - (settings.hysteresis - 0.05) / 0.5))
  const toggleEffect = (id: string): void => {
    const has = settings.drop.effects.includes(id)
    setDrop({
      effects: has ? settings.drop.effects.filter((e) => e !== id) : [...settings.drop.effects, id]
    })
  }

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

        {/* Timing --------------------------------------------------------- */}
        <section className="director-sec">
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

        {/* Look = switch, per camera ------------------------------------- */}
        <section className="director-sec">
          <div className="director-sec-title">Cut to a camera when I look at it</div>
          {cameras.length === 0 ? (
            <p className="settings-hint">Enable cameras to set this per camera.</p>
          ) : (
            cameras.map((c) => (
              <label key={c.deviceId} className="director-check">
                <input
                  type="checkbox"
                  checked={c.lookSwitch}
                  onChange={(e) => onLookSwitch(c.deviceId, e.target.checked)}
                />
                <span>
                  {c.label || 'Camera'}
                  <em>{ROLE_LABEL[c.role]}</em>
                </span>
              </label>
            ))
          )}
        </section>

        {/* Beat-drop effect (Beta) --------------------------------------- */}
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
          {settings.drop.enabled && (
            <>
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
                      checked={settings.drop.effects.includes(fx.id)}
                      onChange={() => toggleEffect(fx.id)}
                    />
                    <span>{fx.name}</span>
                  </label>
                ))}
              </div>
              {settings.drop.effects.length === 0 && (
                <p className="settings-hint">Pick at least one effect for the drop to use.</p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
