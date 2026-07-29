import { useEffect, type JSX } from 'react'
import type { FixtureDefinition, FixtureLimits, FixturePatch } from '@core/lighting/fixtures/types'

/**
 * Per-fixture limits editor. Lets the DJ constrain a moving beam to a safe
 * arc, flip a reversed axis, and cap brightness. Only shows the controls a
 * fixture actually has (a bar with tilt but no pan hides pan; a par shows just
 * the brightness cap).
 */

interface Props {
  patch: FixturePatch
  definition: FixtureDefinition | undefined
  onChange: (limits: FixtureLimits | undefined) => void
  onClose: () => void
}

const pct = (v255: number | undefined, fallback: number): number =>
  Math.round(((v255 ?? fallback) / 255) * 100)
const toDmx = (p: number): number => Math.round((p / 100) * 255)

function RangeControl({
  label,
  min,
  max,
  invert,
  onMin,
  onMax,
  onInvert
}: {
  label: string
  min: number
  max: number
  invert: boolean
  onMin: (v: number) => void
  onMax: (v: number) => void
  onInvert: (v: boolean) => void
}): JSX.Element {
  return (
    <div className="limit-group">
      <div className="limit-head">
        <span>{label} range</span>
        <label className="limit-invert">
          <input type="checkbox" checked={invert} onChange={(e) => onInvert(e.target.checked)} /> invert
        </label>
      </div>
      <label className="limit-slider">
        <span>Min {pct(min, 0)}%</span>
        <input type="range" min={0} max={100} value={pct(min, 0)} onChange={(e) => onMin(toDmx(Number(e.target.value)))} />
      </label>
      <label className="limit-slider">
        <span>Max {pct(max, 255)}%</span>
        <input type="range" min={0} max={100} value={pct(max, 255)} onChange={(e) => onMax(toDmx(Number(e.target.value)))} />
      </label>
    </div>
  )
}

export function FixtureLimitsModal({ patch, definition, onChange, onClose }: Props): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const limits = patch.limits ?? {}
  const hasPan = definition?.channels.some((c) => c.role === 'pan') ?? false
  const hasTilt = definition?.channels.some((c) => c.role === 'tilt') ?? false
  const hasDimmer =
    definition?.channels.some((c) => c.role === 'dimmer' || c.role === 'red' || c.role === 'white') ?? false

  const patchLimits = (next: Partial<FixtureLimits>): void => {
    const merged: FixtureLimits = { ...limits, ...next }
    // Drop empty limits so a fixture with none stays clean.
    const isEmpty =
      merged.panMin === undefined &&
      merged.panMax === undefined &&
      merged.tiltMin === undefined &&
      merged.tiltMax === undefined &&
      !merged.invertPan &&
      !merged.invertTilt &&
      merged.dimmerMax === undefined
    onChange(isEmpty ? undefined : merged)
  }

  return (
    <div className="limits-overlay" onClick={onClose}>
      <div className="limits-modal" onClick={(e) => e.stopPropagation()}>
        <div className="limits-head">
          <h3>Limits - {patch.label}</h3>
          <button className="secondary-button" onClick={onClose}>
            Done
          </button>
        </div>

        {!hasPan && !hasTilt && (
          <p className="settings-hint">This fixture has no moving beam. You can still cap its brightness.</p>
        )}

        {hasPan && (
          <RangeControl
            label="Pan"
            min={limits.panMin ?? 0}
            max={limits.panMax ?? 255}
            invert={limits.invertPan ?? false}
            onMin={(v) => patchLimits({ panMin: v })}
            onMax={(v) => patchLimits({ panMax: v })}
            onInvert={(v) => patchLimits({ invertPan: v || undefined })}
          />
        )}

        {hasTilt && (
          <RangeControl
            label="Tilt"
            min={limits.tiltMin ?? 0}
            max={limits.tiltMax ?? 255}
            invert={limits.invertTilt ?? false}
            onMin={(v) => patchLimits({ tiltMin: v })}
            onMax={(v) => patchLimits({ tiltMax: v })}
            onInvert={(v) => patchLimits({ invertTilt: v || undefined })}
          />
        )}

        {hasDimmer && (
          <div className="limit-group">
            <div className="limit-head">
              <span>Max brightness</span>
            </div>
            <label className="limit-slider">
              <span>{Math.round((limits.dimmerMax ?? 1) * 100)}%</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((limits.dimmerMax ?? 1) * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100
                  patchLimits({ dimmerMax: v >= 1 ? undefined : v })
                }}
              />
            </label>
          </div>
        )}

        <button className="text-button danger" onClick={() => onChange(undefined)}>
          Reset all limits
        </button>
      </div>
    </div>
  )
}
