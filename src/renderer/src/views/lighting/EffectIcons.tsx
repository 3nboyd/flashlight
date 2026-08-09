import type { JSX } from 'react'
import type { EffectType } from '@core/lighting/engine/types'

/**
 * Animated effect icons for the scene editor's effect picker. Each is a
 * small CSS-animated vignette that *demonstrates* the effect rather than
 * describing it - a pulsing dot for Beat Pulse, an orbiting beam for
 * Circle, a running light for Chase. Animations live in lighting.css.
 */

export interface EffectInfo {
  type: EffectType
  label: string
  hint: string
  /** Effects that use the color palette row. */
  usesPalette: boolean
  /** Movement effects expose the size slider and apply to movers. */
  isMovement: boolean
}

export const EFFECT_CATALOG: EffectInfo[] = [
  { type: 'static', label: 'Static', hint: 'Hold one color', usesPalette: false, isMovement: false },
  { type: 'beatPulse', label: 'Beat Pulse', hint: 'Punch on every beat', usesPalette: false, isMovement: false },
  { type: 'breathe', label: 'Breathe', hint: 'Slow swell', usesPalette: false, isMovement: false },
  { type: 'eighthBuild', label: 'Eighth Build', hint: '8th-note riser', usesPalette: false, isMovement: false },
  { type: 'strike', label: 'Strike', hint: 'Occasional hit + hold', usesPalette: false, isMovement: false },
  { type: 'tapPulse', label: 'Tap Pulse', hint: 'Blackout; flashes on each tap', usesPalette: true, isMovement: false },
  { type: 'sweep', label: 'Side Sweep', hint: 'Light travels side to side', usesPalette: false, isMovement: false },
  { type: 'colorCycle', label: 'Color Cycle', hint: 'Step through colors', usesPalette: true, isMovement: false },
  { type: 'randomColor', label: 'Random Color', hint: 'Random color holds', usesPalette: true, isMovement: false },
  { type: 'alternate', label: 'Alternate', hint: 'Odd/even swap', usesPalette: true, isMovement: false },
  { type: 'chase', label: 'Chase', hint: 'One light runs along', usesPalette: true, isMovement: false },
  { type: 'solo', label: 'Solo', hint: 'One light, switches (eerie)', usesPalette: false, isMovement: false },
  { type: 'sparkle', label: 'Sparkle', hint: 'Random twinkle', usesPalette: false, isMovement: false },
  { type: 'rainbow', label: 'Rainbow', hint: 'Hue flow across rig', usesPalette: false, isMovement: false },
  { type: 'rainbowStep', label: 'Rainbow Peak', hint: 'Hue snaps per beat', usesPalette: false, isMovement: false },
  { type: 'strobe', label: 'Strobe', hint: 'Continuous flash', usesPalette: true, isMovement: false },
  { type: 'eighthStrobe', label: 'Eighth Strobe', hint: 'Flash on 8th notes', usesPalette: true, isMovement: false },
  { type: 'audioLevel', label: 'Audio Level', hint: 'Follows loudness', usesPalette: false, isMovement: false },
  { type: 'bassPulse', label: 'Bass Pulse', hint: 'Kick-reactive', usesPalette: false, isMovement: false },
  { type: 'movementCircle', label: 'Circle', hint: 'Beams orbit', usesPalette: false, isMovement: true },
  { type: 'movementSweep', label: 'Sweep', hint: 'Side-to-side wave', usesPalette: false, isMovement: true },
  { type: 'movementFigure8', label: 'Figure 8', hint: 'Infinity trace', usesPalette: false, isMovement: true },
  { type: 'movementNod', label: 'Nod', hint: 'Tilt wave', usesPalette: false, isMovement: true },
  { type: 'movementRandom', label: 'Random', hint: 'Ballyhoo jumps', usesPalette: false, isMovement: true }
]

export function EffectIcon({ type }: { type: EffectType }): JSX.Element {
  switch (type) {
    case 'static':
      return (
        <div className="fx-icon">
          <div className="fx-dot" />
        </div>
      )
    case 'beatPulse':
      return (
        <div className="fx-icon">
          <div className="fx-dot fx-anim-pulse" />
        </div>
      )
    case 'breathe':
      return (
        <div className="fx-icon">
          <div className="fx-dot fx-anim-breathe" />
        </div>
      )
    case 'eighthBuild':
      return (
        <div className="fx-icon fx-row bars">
          {[0, 0.12, 0.24, 0.36].map((d, i) => (
            <div key={i} className="fx-bar fx-anim-build" style={{ animationDelay: `${d}s` }} />
          ))}
        </div>
      )
    case 'strike':
      return (
        <div className="fx-icon">
          <div className="fx-dot big fx-anim-bass" />
        </div>
      )
    case 'tapPulse':
      return (
        <div className="fx-icon">
          <div className="fx-dot fx-anim-strobe" />
        </div>
      )
    case 'sweep':
      return (
        <div className="fx-icon">
          <div className="fx-beam-dot fx-anim-sweep" />
        </div>
      )
    case 'colorCycle':
      return (
        <div className="fx-icon">
          <div className="fx-dot fx-anim-colorcycle" />
        </div>
      )
    case 'randomColor':
      return (
        <div className="fx-icon">
          <div className="fx-dot fx-anim-randomcolor" />
        </div>
      )
    case 'alternate':
      return (
        <div className="fx-icon fx-row">
          <div className="fx-cell fx-anim-alt-a" />
          <div className="fx-cell fx-anim-alt-b" />
          <div className="fx-cell fx-anim-alt-a" />
          <div className="fx-cell fx-anim-alt-b" />
        </div>
      )
    case 'chase':
      return (
        <div className="fx-icon fx-row">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="fx-cell fx-anim-chase" style={{ animationDelay: `${i * 0.25}s` }} />
          ))}
        </div>
      )
    case 'sparkle':
      return (
        <div className="fx-icon fx-grid">
          {[0.1, 0.7, 0.4, 0.9, 0.2, 0.55].map((d, i) => (
            <div key={i} className="fx-cell small fx-anim-sparkle" style={{ animationDelay: `${d}s` }} />
          ))}
        </div>
      )
    case 'solo':
      return (
        <div className="fx-icon fx-row">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="fx-cell fx-anim-solo" style={{ animationDelay: `${i * 0.5}s` }} />
          ))}
        </div>
      )
    case 'rainbow':
      return (
        <div className="fx-icon">
          <div className="fx-dot fx-anim-rainbow" />
        </div>
      )
    case 'rainbowStep':
      return (
        <div className="fx-icon">
          <div className="fx-dot fx-anim-rainbow-step" />
        </div>
      )
    case 'strobe':
      return (
        <div className="fx-icon">
          <div className="fx-cell wide fx-anim-strobe" />
        </div>
      )
    case 'eighthStrobe':
      return (
        <div className="fx-icon">
          <div className="fx-cell wide fx-anim-strobe-eighth" />
        </div>
      )
    case 'audioLevel':
      return (
        <div className="fx-icon fx-row bars">
          {[0, 0.2, 0.1, 0.35].map((d, i) => (
            <div key={i} className="fx-bar fx-anim-eq" style={{ animationDelay: `${d}s` }} />
          ))}
        </div>
      )
    case 'bassPulse':
      return (
        <div className="fx-icon">
          <div className="fx-dot big fx-anim-bass" />
        </div>
      )
    case 'movementCircle':
      return (
        <div className="fx-icon">
          <div className="fx-orbit fx-anim-orbit">
            <div className="fx-beam-dot" />
          </div>
        </div>
      )
    case 'movementSweep':
      return (
        <div className="fx-icon">
          <div className="fx-beam-dot fx-anim-sweep" />
        </div>
      )
    case 'movementFigure8':
      return (
        <div className="fx-icon">
          <div className="fx-beam-dot fx-anim-fig8" />
        </div>
      )
    case 'movementNod':
      return (
        <div className="fx-icon">
          <div className="fx-beam-dot fx-anim-nod" />
        </div>
      )
    case 'movementRandom':
      return (
        <div className="fx-icon">
          <div className="fx-beam-dot fx-anim-random" />
        </div>
      )
    default:
      return (
        <div className="fx-icon">
          <div className="fx-dot" />
        </div>
      )
  }
}
