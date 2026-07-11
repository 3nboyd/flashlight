import { useCallback, useRef, type JSX } from 'react'

/**
 * Rotary knob: drag up/down (or scroll) to change the value. Sweeps a
 * ~270° arc. Used for pan/tilt trim, movement speed, and reactivity in
 * Perform. Double-click resets to the provided default.
 */

interface KnobProps {
  label: string
  value: number
  min: number
  max: number
  /** Value shown as "centered/off"; defaults to min. */
  resetValue?: number
  /** Optional formatter for the readout under the knob. */
  format?: (v: number) => string
  onChange: (value: number) => void
}

const START_ANGLE = -135
const SWEEP = 270

export function Knob({ label, value, min, max, resetValue, format, onChange }: KnobProps): JSX.Element {
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null)
  const fraction = (value - min) / (max - min)
  const angle = START_ANGLE + fraction * SWEEP

  // Pull the value to the default when it lands within a small dead zone, so
  // "center"/"1x" is easy to hit by feel instead of pixel-hunting.
  const snap = useCallback(
    (v: number): number => {
      if (resetValue === undefined) return v
      const deadZone = (max - min) * 0.04
      return Math.abs(v - resetValue) <= deadZone ? resetValue : v
    },
    [min, max, resetValue]
  )

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragRef.current) return
      const dy = dragRef.current.startY - e.clientY
      const range = max - min
      // Full range over ~180px of vertical travel.
      const next = Math.max(min, Math.min(max, dragRef.current.startValue + (dy / 180) * range))
      onChange(snap(next))
    },
    [min, max, onChange, snap]
  )

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
  }, [handlePointerMove])

  function handlePointerDown(e: React.PointerEvent): void {
    dragRef.current = { startY: e.clientY, startValue: value }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <div className="knob">
      <div
        className="knob-dial"
        onPointerDown={handlePointerDown}
        onDoubleClick={() => onChange(resetValue ?? min)}
        onWheel={(e) => {
          const step = (max - min) / 40
          onChange(snap(Math.max(min, Math.min(max, value - Math.sign(e.deltaY) * step))))
        }}
        title="Drag up/down to adjust, double-click to reset"
      >
        <svg viewBox="0 0 44 44" width="44" height="44">
          <circle cx="22" cy="22" r="18" className="knob-track" />
          <circle
            cx="22"
            cy="22"
            r="18"
            className="knob-fill"
            style={{
              strokeDasharray: `${(fraction * SWEEP * Math.PI * 18) / 180} 999`,
              transform: `rotate(${START_ANGLE - 90}deg)`,
              transformOrigin: 'center'
            }}
          />
          <line
            x1="22"
            y1="22"
            x2="22"
            y2="8"
            className="knob-pointer"
            style={{ transform: `rotate(${angle}deg)`, transformOrigin: '22px 22px' }}
          />
        </svg>
      </div>
      <div className="knob-label">{label}</div>
      <div className="knob-value">{format ? format(value) : value.toFixed(2)}</div>
    </div>
  )
}
