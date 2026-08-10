import { Universe } from '../dmx/Universe'
import { segmentCount, type FixtureLimits, type PatchedFixture } from '../fixtures/types'
import type { AudioFeatures } from '../audio/features'
import { SILENT_FEATURES } from '../audio/features'
import type { BeatPosition } from './BeatClock'
import type { LiveOverrides, Rgbw, Scene, SceneTarget, EffectSettings } from './types'
import { DEFAULT_OVERRIDES } from './types'
import type { SmartPhase } from './SmartMode'

interface FixtureOutput {
  color: Rgbw
  dimmer: number
  strobing: boolean
  pan: number
  tilt: number
}

const WHITE: Rgbw = { r: 255, g: 255, b: 255, w: 255 }

function hueToRgb(hue: number): Rgbw {
  const h = ((hue % 360) + 360) % 360
  const x = 1 - Math.abs(((h / 60) % 2) - 1)
  let rgb: [number, number, number]
  if (h < 60) rgb = [1, x, 0]
  else if (h < 120) rgb = [x, 1, 0]
  else if (h < 180) rgb = [0, 1, x]
  else if (h < 240) rgb = [0, x, 1]
  else if (h < 300) rgb = [x, 0, 1]
  else rgb = [1, 0, x]
  return { r: Math.round(rgb[0] * 255), g: Math.round(rgb[1] * 255), b: Math.round(rgb[2] * 255) }
}

/**
 * Computes what one fixture in a target should output at a given musical
 * position. Pure per-tick math: every animated quantity derives from the
 * beat position, audio features, or wall-clock ms, never from mutable
 * accumulated state - so ticks are deterministic and testable.
 */
interface EffectModifiers {
  /** Multiplies movement-effect speed (knob), 1 = as programmed. */
  movementSpeed: number
  /** Scales audio-reactive intensity (knob), 1 = as programmed. */
  reactivity: number
}

const NO_MODIFIERS: EffectModifiers = { movementSpeed: 1, reactivity: 1 }

/** Manual tap flash state for the tapPulse effect. */
export interface TapState {
  /** 0-1 flash envelope: 1 right after a tap, decaying to 0 between taps. */
  env: number
  /** Number of taps so far, used to cycle the color. */
  index: number
}

const NO_TAP: TapState = { env: 0, index: 0 }

/**
 * Where the track is in its build/drop arc, so a single scene can adapt: the
 * host feeds this from an always-on energy detector (no autopilot required).
 */
export interface SongState {
  phase: SmartPhase
  /** 0-1 progress through a detected build-up. */
  buildProgress: number
}

const STEADY_SONG: SongState = { phase: 'steady', buildProgress: 0 }

/** Effects that actively aim moving fixtures, so they should NOT park home. */
const MOVEMENT_EFFECTS = new Set<EffectSettings['type']>([
  'movementCircle',
  'movementSweep',
  'movementFigure8',
  'movementNod',
  'movementRandom',
  'solo'
])

function applyEffect(
  target: SceneTarget,
  effect: EffectSettings | undefined,
  fixtureIndex: number,
  fixtureCount: number,
  beat: BeatPosition,
  audio: AudioFeatures,
  mod: EffectModifiers = NO_MODIFIERS,
  tap: TapState = NO_TAP,
  song: SongState = STEADY_SONG
): FixtureOutput {
  const base: FixtureOutput = {
    color: target.color,
    dimmer: target.dimmer,
    strobing: false,
    pan: target.pan ?? 128,
    tilt: target.tilt ?? 128
  }
  if (!effect || effect.type === 'static') return base

  // Movement effects sweep faster/slower with the speed knob; the divisor
  // shrinks the beat window so the geometry cycles quicker.
  const beats = (effect.beats ?? 4) / Math.max(0.05, mod.movementSpeed)
  const palette = effect.colors && effect.colors.length > 0 ? effect.colors : [target.color]

  switch (effect.type) {
    case 'beatPulse': {
      // Hard hit on the beat, near-black between: a steeper curve and a very
      // low floor make the pulse read big (bright highs, deep lows).
      const envelope = Math.pow(1 - beat.beatPhase, 2.6)
      return { ...base, dimmer: target.dimmer * (0.04 + 0.96 * envelope) }
    }
    case 'breathe': {
      // Slow sine swell across the cycle - never fully dark.
      const swell = 0.5 - 0.5 * Math.cos((beat.beat / beats) * 2 * Math.PI)
      return { ...base, dimmer: target.dimmer * (0.25 + 0.75 * swell) }
    }
    case 'eighthBuild': {
      // 8th-note pulses whose brightness floor rises and whose decay sharpens
      // across the phrase, so the rig audibly "builds" toward the drop.
      const eighthPhase = (beat.beat * 2) % 1
      const decay = 1.2 + 2.5 * beat.phrasePhase
      const envelope = Math.pow(1 - eighthPhase, decay)
      const floor = 0.12 + 0.35 * beat.phrasePhase
      return { ...base, dimmer: target.dimmer * Math.min(1, floor + (1 - floor) * envelope) }
    }
    case 'strike': {
      // A hard hit every `beats`, then a hold-and-fade until the next: an
      // occasional beam that shoots out and lingers rather than pulsing.
      const phase = (beat.beat / beats) % 1
      return { ...base, dimmer: target.dimmer * Math.pow(1 - phase, 1.3) }
    }
    case 'tapPulse': {
      // Blackout until tapped: fully dark between taps, and each tap fires a
      // strong flash in a cycling rainbow color with the white LEDs firing too
      // (color on RGB, strobe on the white channel).
      const swatch = palette[tap.index % palette.length]
      const color: Rgbw = { r: swatch.r, g: swatch.g, b: swatch.b, w: Math.round(255 * tap.env) }
      return { ...base, color, dimmer: target.dimmer * tap.env }
    }
    case 'sweep': {
      // A bright point travels across the group in stage order, side to side
      // (ping-pong), dark elsewhere. Position-aware, so it flows left to right
      // across whatever fixtures/pixels the scene targets.
      const pos = fixtureCount > 1 ? fixtureIndex / (fixtureCount - 1) : 0.5
      const phase = (beat.beat / beats) % 2
      const head = phase < 1 ? phase : 2 - phase // 0 -> 1 -> 0
      const width = 0.24
      const env = Math.max(0, 1 - Math.abs(pos - head) / width)
      return { ...base, dimmer: target.dimmer * Math.pow(env, 1.4) }
    }
    case 'drift': {
      // A soft glow that roams slowly and semi-randomly across the rig in stage
      // order, brightness easing to nothing at its edges - an eerie, constantly
      // drifting pulse (not beat-locked). `beats` sets how slowly it wanders
      // between random waypoints; `size` sets how wide the glow is. The white
      // LEDs glow too, so a fixture's white strip joins the drift.
      const pos = fixtureCount > 1 ? fixtureIndex / (fixtureCount - 1) : 0.5
      const t = beat.beat / beats // slow timebase; each unit is one wander leg
      const waypoint = (n: number): number => {
        const v = Math.abs(Math.sin(n * 127.1 + 4.7)) * 43758.5453
        return v - Math.floor(v) // deterministic 0..1 target per leg
      }
      const legStart = Math.floor(t)
      const f = t - legStart
      const eased = f * f * (3 - 2 * f) // smoothstep for a gentle glide
      // Wander between random waypoints, plus a tiny wobble so it never sits
      // perfectly still even while easing between legs.
      const center =
        waypoint(legStart) +
        (waypoint(legStart + 1) - waypoint(legStart)) * eased +
        0.015 * Math.sin(beat.beat * 1.3)
      const width = Math.max(0.05, effect.size ?? 0.38)
      const glow = Math.pow(Math.max(0, 1 - Math.abs(pos - center) / width), 1.8)
      return { ...base, color: { ...target.color, w: Math.round(255 * glow) }, dimmer: target.dimmer * glow }
    }
    case 'colorCycle': {
      const step = Math.floor(beat.beat / beats) % palette.length
      return { ...base, color: palette[step] }
    }
    case 'randomColor': {
      // Jump to a pseudo-random palette color every `beats` and hold until the
      // next step. Deterministic per step so every tick agrees.
      const step = Math.floor(beat.beat / beats)
      const hash = Math.abs(Math.sin(step * 91.17)) * 43758.5453
      const frac = hash - Math.floor(hash)
      const color =
        palette.length > 1 ? palette[Math.floor(frac * palette.length) % palette.length] : hueToRgb(frac * 360)
      return { ...base, color }
    }
    case 'alternate': {
      // Odd/even fixtures swap two palette colors every N beats.
      const colorA = palette[0]
      const colorB = palette.length > 1 ? palette[1] : { r: 255 - colorA.r, g: 255 - colorA.g, b: 255 - colorA.b }
      const flip = Math.floor(beat.beat / beats) % 2
      const isEven = fixtureIndex % 2 === 0
      return { ...base, color: isEven === (flip === 0) ? colorA : colorB }
    }
    case 'sparkle': {
      // Deterministic twinkle: each fixture/cell flashes on pseudo-random
      // beat subdivisions derived from its index and the beat counter.
      const subdivision = Math.floor(beat.beat * 4) // 16th-note grid
      const hash = Math.abs(Math.sin(subdivision * 12.9898 + fixtureIndex * 78.233)) * 43758.5453
      const lit = hash - Math.floor(hash) < 0.28
      return { ...base, dimmer: lit ? target.dimmer : target.dimmer * 0.06 }
    }
    case 'chase': {
      const positions = Math.max(2, fixtureCount)
      const active = Math.floor(beat.beat) % positions
      const isActive = fixtureIndex % positions === active
      const color = palette[Math.floor(beat.beat / positions) % palette.length]
      return { ...base, color, dimmer: isActive ? target.dimmer : 0 }
    }
    case 'rainbow': {
      const spread = fixtureCount > 1 ? (fixtureIndex / fixtureCount) * 360 : 0
      const hue = beat.phrasePhase * 360 * (effect.beats ? 32 / effect.beats : 1) + spread
      return { ...base, color: hueToRgb(hue) }
    }
    case 'rainbowStep': {
      // Rainbow that snaps to the next hue on each quarter note (beats:1) for
      // hard, peak-time color changes rather than a smooth wash.
      const step = Math.floor(beat.beat / beats)
      const spread = fixtureCount > 1 ? (fixtureIndex / fixtureCount) * 360 : 0
      return { ...base, color: hueToRgb(step * 60 + spread) }
    }
    case 'rainbowStrobe': {
      // The color LEDs flash through rainbow colors (snapping each beat, spread
      // across the pixels) while ONLY the separate white LEDs pop white for a
      // brief moment right on each beat. A gentle beat pulse breathes over
      // everything so the whole panel throbs on the downbeat instead of sitting
      // flat - one effect drives a fixture's color pixels and its white LEDs.
      const step = Math.floor(beat.beat / beats)
      const spread = fixtureCount > 1 ? (fixtureIndex / fixtureCount) * 360 : 0
      const rgb = hueToRgb(step * 60 + spread)
      const phase = (beat.beat / beats) % 1 // 0..1 within each color step
      // The white LEDs flash on their own subdivision (default a quarter note),
      // a short fixed-length pop regardless of rate, so slower rates stay snappy.
      const flashBeats = Math.max(0.125, effect.flashBeats ?? 1)
      const flashing = beat.beat % flashBeats < 0.18
      const whitePop = flashing ? 255 : 0
      // Pop the whole panel to full on the flash (so the white hit reads at full
      // brightness); otherwise breathe gently on the color pulse, never dark.
      const pulse = flashing ? 1 : 0.5 + 0.5 * Math.pow(1 - phase, 2)
      return {
        ...base,
        color: { r: rgb.r, g: rgb.g, b: rgb.b, w: whitePop },
        dimmer: target.dimmer * pulse
      }
    }
    case 'strobe':
      // Strobe naturally punches at full brightness (master dimmer / a
      // fixture's brightness cap still apply downstream).
      return { ...base, strobing: true, color: palette[0], dimmer: 1 }
    case 'eighthStrobe': {
      // Tempo-locked flash: full on for the front of each 8th note, dark
      // between. Synced to the grid, unlike the free-running hardware strobe.
      const eighthPhase = (beat.beat * 2) % 1
      return { ...base, dimmer: eighthPhase < 0.45 ? 1 : 0 }
    }
    case 'audioLevel':
      return { ...base, dimmer: target.dimmer * Math.min(1, audio.rms * 1.4 * mod.reactivity) }
    case 'bassPulse':
      // Gate out low rumble and amplify the kick so hits punch and gaps go dark.
      return {
        ...base,
        dimmer: target.dimmer * Math.min(1, Math.max(0, audio.bass - 0.08) * 1.7 * mod.reactivity)
      }
    case 'movementCircle': {
      const amplitude = (effect.amplitude ?? 0.5) * 127
      // Phase-offset across the group so multiple heads (or the segments of
      // a wave bar) ripple instead of moving in lockstep.
      const spread = fixtureCount > 1 ? (fixtureIndex / fixtureCount) * Math.PI : 0
      const angle = (beat.beat / beats) * 2 * Math.PI + spread
      return {
        ...base,
        pan: (target.pan ?? 128) + Math.sin(angle) * amplitude,
        tilt: (target.tilt ?? 128) + Math.cos(angle) * amplitude
      }
    }
    case 'movementSweep': {
      const amplitude = (effect.amplitude ?? 0.5) * 127
      const spread = fixtureCount > 1 ? (fixtureIndex / fixtureCount) * Math.PI : 0
      const angle = (beat.beat / beats) * 2 * Math.PI + spread
      // Full-range swing on both axes so a tilt-only bar uses its whole travel
      // (and its whole limit window), not a damped middle slice.
      return {
        ...base,
        pan: (target.pan ?? 128) + Math.sin(angle) * amplitude,
        tilt: (target.tilt ?? 128) + Math.sin(angle) * amplitude
      }
    }
    case 'movementFigure8': {
      // Lissajous 2:1 - the classic infinity trace.
      const amplitude = (effect.amplitude ?? 0.5) * 127
      const spread = fixtureCount > 1 ? (fixtureIndex / fixtureCount) * Math.PI : 0
      const angle = (beat.beat / beats) * 2 * Math.PI + spread
      return {
        ...base,
        pan: (target.pan ?? 128) + Math.sin(angle) * amplitude,
        tilt: (target.tilt ?? 128) + Math.sin(angle * 2) * amplitude * 0.9
      }
    }
    case 'movementNod': {
      // Tilt-only wave: beams nod up/down, rippling across the group.
      const amplitude = (effect.amplitude ?? 0.5) * 127
      const spread = fixtureCount > 1 ? (fixtureIndex / fixtureCount) * Math.PI : 0
      const angle = (beat.beat / beats) * 2 * Math.PI + spread
      return { ...base, tilt: (target.tilt ?? 128) + Math.sin(angle) * amplitude }
    }
    case 'movementRandom': {
      // Ballyhoo: each head jumps to a new pseudo-random position every N
      // beats - deterministic per (step, fixture) so ticks agree. When a
      // palette is supplied, the whole group also snaps to one shared random
      // color per step (same hash as 'randomColor'), so movers stay in sync
      // with a rig-wide random-color wash.
      const amplitude = (effect.amplitude ?? 0.5) * 127
      const step = Math.floor(beat.beat / beats)
      const hashOf = (salt: number): number => {
        const v = Math.abs(Math.sin(step * 12.9898 + fixtureIndex * 78.233 + salt)) * 43758.5453
        return (v - Math.floor(v)) * 2 - 1 // -1..1
      }
      let color = base.color
      if (effect.colors && effect.colors.length > 0) {
        const h = Math.abs(Math.sin(step * 91.17)) * 43758.5453
        const frac = h - Math.floor(h)
        color = effect.colors[Math.floor(frac * effect.colors.length) % effect.colors.length]
      }
      return {
        ...base,
        color,
        pan: (target.pan ?? 128) + hashOf(1) * amplitude,
        tilt: (target.tilt ?? 128) + hashOf(7) * amplitude
      }
    }
    case 'solo': {
      // Eerie sparse look: a contiguous band of cells lit at a time, jumping to
      // a different random spot every `beats`. The band is a fraction of the
      // group (default ~a third) so on a many-pixel strobe it reads as a solid
      // chunk, not a single dot; on a few-cell beam bar it stays a lone beam.
      // Beam fixtures also re-aim per switch so the light points somewhere new.
      const step = Math.floor(beat.beat / beats)
      const hash = Math.abs(Math.sin(step * 53.17 + 11.7)) * 43758.5453
      const width = Math.max(1, Math.round(fixtureCount * (effect.size ?? 0.3)))
      const center = Math.floor((hash - Math.floor(hash)) * Math.max(1, fixtureCount))
      const start = Math.max(0, Math.min(fixtureCount - width, center - Math.floor(width / 2)))
      const lit = fixtureIndex >= start && fixtureIndex < start + width
      const aim = (salt: number): number => {
        const v = Math.abs(Math.sin(step * 12.9898 + salt)) * 43758.5453
        return (v - Math.floor(v)) * 2 - 1
      }
      const amplitude = (effect.amplitude ?? 1) * 127
      return {
        ...base,
        dimmer: lit ? target.dimmer : 0,
        pan: (target.pan ?? 128) + aim(1) * amplitude,
        tilt: (target.tilt ?? 128) + aim(7) * amplitude
      }
    }
    // ---- Adaptive "song arc" effects ---------------------------------------
    // One scene that follows the track: a calm base look, a rising build, and a
    // peak on the drop. `song.phase` comes from the host's always-on energy
    // detector; `song.buildProgress` ramps 0->1 through a build. All three read
    // the live bass so the peak genuinely punches on the kick.
    case 'songRainbow': {
      const spread = fixtureCount > 1 ? (fixtureIndex / fixtureCount) * 360 : 0
      const bassHit = Math.min(1, Math.max(0, audio.bass - 0.05) * 1.8)
      if (song.phase === 'drop') {
        // Peak: per-beat rainbow, white LEDs pop on the beat, bass-driven throb.
        const rgb = hueToRgb(Math.floor(beat.beat) * 60 + spread)
        const pulse = 0.4 + 0.6 * Math.max(Math.pow(1 - beat.beatPhase, 2), bassHit)
        return {
          ...base,
          color: { r: rgb.r, g: rgb.g, b: rgb.b, w: beat.beatPhase < 0.16 ? 255 : 0 },
          dimmer: target.dimmer * pulse
        }
      }
      if (song.phase === 'build') {
        // Build: quarter-note rainbow with a rising floor and 8th-note pulse.
        const rgb = hueToRgb(Math.floor(beat.beat) * 60 + spread)
        const eighth = (beat.beat * 2) % 1
        const floor = 0.2 + 0.5 * song.buildProgress
        return { ...base, color: rgb, dimmer: target.dimmer * Math.min(1, floor + (1 - floor) * Math.pow(1 - eighth, 2)) }
      }
      // Steady/break: slow rainbow wash breathing gently on the beat.
      const soft = 0.55 + 0.45 * Math.pow(1 - beat.beatPhase, 1.6)
      return { ...base, color: hueToRgb(beat.phrasePhase * 720 + spread), dimmer: target.dimmer * soft }
    }
    case 'songRed': {
      const bassHit = Math.min(1, Math.max(0, audio.bass - 0.05) * 1.8)
      if (song.phase === 'drop') {
        // Peak: the alert color pulses hard with the bass while white LEDs pop.
        const pulse = 0.35 + 0.65 * Math.max(Math.pow(1 - beat.beatPhase, 2), bassHit)
        return { ...base, color: { ...target.color, w: beat.beatPhase < 0.14 ? 255 : 0 }, dimmer: target.dimmer * pulse }
      }
      if (song.phase === 'build') {
        // Build: a crash strobe that quickens and brightens toward the drop.
        const rate = 2 + Math.floor(song.buildProgress * 6)
        const gate = Math.floor(beat.beat * rate) % 2 === 0 ? 1 : 0.12 + 0.3 * song.buildProgress
        return { ...base, color: target.color, dimmer: target.dimmer * gate }
      }
      // Steady/break: small random lights flickering in the alert color.
      const sub = Math.floor(beat.beat * 2)
      const h = Math.abs(Math.sin(sub * 12.9898 + fixtureIndex * 78.233)) * 43758.5453
      const lit = h - Math.floor(h) < 0.22
      return { ...base, color: target.color, dimmer: target.dimmer * (lit ? 1 : 0.04) }
    }
    case 'songFrost': {
      const bassHit = Math.min(1, Math.max(0, audio.bass - 0.05) * 1.8)
      if (song.phase === 'drop') {
        // Peak: icy color + white LEDs strobing on the bass.
        const pulse = 0.4 + 0.6 * Math.max(Math.pow(1 - beat.beatPhase, 2), bassHit)
        return { ...base, color: { ...target.color, w: beat.beatPhase < 0.16 ? 255 : 0 }, dimmer: target.dimmer * pulse }
      }
      if (song.phase === 'build') {
        // Build: a white riser that whitens and quickens toward the drop.
        const rate = 2 + Math.floor(song.buildProgress * 6)
        const gate = Math.floor(beat.beat * rate) % 2 === 0 ? 1 : 0.15 + 0.3 * song.buildProgress
        return {
          ...base,
          color: { ...target.color, w: Math.round(255 * song.buildProgress) },
          dimmer: target.dimmer * gate
        }
      }
      // Steady/break: slow icy swell that never fully goes dark.
      const swell = 0.5 - 0.5 * Math.cos(beat.phrasePhase * 4 * Math.PI)
      return { ...base, color: target.color, dimmer: target.dimmer * (0.25 + 0.5 * swell) }
    }
    default:
      return base
  }
}

/**
 * Remaps a fixture's output through its physical limits: optionally mirror
 * pan/tilt, compress the full 0-255 sweep into the allowed [min,max] window
 * (so effects keep their motion but stay inside a safe arc), and cap dimmer.
 *
 * When `resting` (no movement effect is aiming this fixture) and a home
 * position is set, the fixture parks at that home pan/tilt directly - the
 * window remap is skipped, since the DJ dialed the resting angle they want.
 */
function applyLimits(out: FixtureOutput, limits: FixtureLimits, resting: boolean): FixtureOutput {
  const clamp = (v: number): number => Math.max(0, Math.min(255, v))
  let pan: number
  let tilt: number
  if (resting && (limits.homePan !== undefined || limits.homeTilt !== undefined)) {
    const homePan = limits.homePan ?? out.pan
    const homeTilt = limits.homeTilt ?? out.tilt
    pan = clamp(limits.invertPan ? 255 - homePan : homePan)
    tilt = clamp(limits.invertTilt ? 255 - homeTilt : homeTilt)
  } else {
    const p = limits.invertPan ? 255 - out.pan : out.pan
    const t = limits.invertTilt ? 255 - out.tilt : out.tilt
    const panMin = limits.panMin ?? 0
    const panMax = limits.panMax ?? 255
    const tiltMin = limits.tiltMin ?? 0
    const tiltMax = limits.tiltMax ?? 255
    pan = panMin + (clamp(p) / 255) * (panMax - panMin)
    tilt = tiltMin + (clamp(t) / 255) * (tiltMax - tiltMin)
  }
  const dimmer = limits.dimmerMax !== undefined ? Math.min(out.dimmer, limits.dimmerMax) : out.dimmer
  return { ...out, pan, tilt, dimmer }
}

function targetMatches(target: SceneTarget, fixture: PatchedFixture): boolean {
  if (target.group === 'all') return true
  if (target.group.startsWith('kind:')) {
    return fixture.definition.kind === target.group.slice(5)
  }
  return fixture.patch.group === target.group
}

/**
 * Spatial ordering for group-spread effects (chase, rainbow, sparkle,
 * movement). Instead of spreading by patch order, we lay every lit "cell" out
 * along the physical X axis of the stage so a sweep flows left to right across
 * the whole rig - a strobe on the left, then each pixel of a bar in the
 * middle, then a strobe on the right, as one continuous motion.
 *
 * Two orderings come out of this:
 *  - cell order: single fixtures and every individual pixel of a segmented
 *    fixture, ranked by X. Drives color-spread effects so a bar's pixels join
 *    the same chase as the pars beside it.
 *  - fixture order: whole fixtures ranked by X. Drives the non-segmented
 *    output (pan/tilt) so a multi-pixel bar swings as one unit rather than
 *    rippling per pixel.
 */
interface GroupOrder {
  cellRank: Map<string, number[]>
  cellTotal: Map<string, number>
  fixtureRank: Map<string, number>
  fixtureTotal: Map<string, number>
}

function computeGroupOrder(
  fixtures: PatchedFixture[],
  scene: Scene,
  positions?: Map<string, number>
): GroupOrder {
  const cellRank = new Map<string, number[]>()
  const cellTotal = new Map<string, number>()
  const fixtureRank = new Map<string, number>()
  const fixtureTotal = new Map<string, number>()

  const patchOrder = new Map<string, number>()
  fixtures.forEach((f, i) => patchOrder.set(f.patch.id, i))

  // Group fixtures by their effective target (last matching wins).
  const groups = new Map<SceneTarget, PatchedFixture[]>()
  for (const fixture of fixtures) {
    const matching = scene.targets.filter((t) => targetMatches(t, fixture))
    if (matching.length === 0) continue
    const target = matching[matching.length - 1]
    const arr = groups.get(target)
    if (arr) arr.push(fixture)
    else groups.set(target, [fixture])
  }

  // X in 0..1: the fixture's saved/auto stage position when known, else spread
  // evenly by patch order so behaviour is deterministic without a stage.
  const xOf = (fixture: PatchedFixture, group: PatchedFixture[]): number => {
    const known = positions?.get(fixture.patch.id)
    if (known !== undefined) return known
    return group.length > 1 ? group.indexOf(fixture) / (group.length - 1) : 0.5
  }

  for (const group of groups.values()) {
    const byFixture = [...group].sort(
      (a, b) => xOf(a, group) - xOf(b, group) || patchOrder.get(a.patch.id)! - patchOrder.get(b.patch.id)!
    )
    byFixture.forEach((fixture, rank) => {
      fixtureRank.set(fixture.patch.id, rank)
      fixtureTotal.set(fixture.patch.id, group.length)
    })

    // One cell per single fixture, one per pixel of a segmented fixture.
    const cells: { id: string; seg: number; x: number; order: number }[] = []
    for (const fixture of group) {
      const count = Math.max(1, segmentCount(fixture.definition))
      const x = xOf(fixture, group)
      const order = patchOrder.get(fixture.patch.id)!
      for (let s = 0; s < count; s++) cells.push({ id: fixture.patch.id, seg: s, x, order })
    }
    // Order by X; a fixture's own pixels stay contiguous and in pixel order.
    cells.sort((a, b) => a.x - b.x || a.order - b.order || a.seg - b.seg)
    cells.forEach((cell, rank) => {
      const arr = cellRank.get(cell.id) ?? []
      arr[cell.seg] = rank
      cellRank.set(cell.id, arr)
      cellTotal.set(cell.id, cells.length)
    })
  }

  return { cellRank, cellTotal, fixtureRank, fixtureTotal }
}

/**
 * Renders one engine tick: active scene + live overrides + beat position +
 * audio features → fresh Universe buffers keyed by universe number.
 */
export function renderTick(options: {
  fixtures: PatchedFixture[]
  scene: Scene | null
  overrides?: LiveOverrides
  beat: BeatPosition
  audio?: AudioFeatures
  nowMs: number
  /** Fixture id -> normalized stage X (0..1), so effects spread by position. */
  positions?: Map<string, number>
  /** Manual tap flash state for tapPulse scenes. */
  tap?: TapState
  /** Song build/drop phase, so adaptive scenes can follow the track. */
  song?: SongState
}): Map<number, Universe> {
  const { fixtures, scene, beat, nowMs } = options
  const overrides = options.overrides ?? DEFAULT_OVERRIDES
  const audio = options.audio ?? SILENT_FEATURES
  const tap = options.tap ?? NO_TAP
  const song = options.song ?? STEADY_SONG
  const order = scene && !overrides.blackout ? computeGroupOrder(fixtures, scene, options.positions) : null
  const mod: EffectModifiers = {
    movementSpeed: overrides.movementSpeed ?? 1,
    reactivity: overrides.reactivity ?? 1
  }
  const panShift = (overrides.panOffset ?? 0) * 127
  const tiltShift = (overrides.tiltOffset ?? 0) * 127

  const universes = new Map<number, Universe>()
  const universeFor = (n: number): Universe => {
    let u = universes.get(n)
    if (!u) {
      u = new Universe()
      universes.set(n, u)
    }
    return u
  }

  // Ensure every patched universe exists (so outputs go dark rather than stale).
  for (const fixture of fixtures) universeFor(fixture.patch.universe)

  for (const fixture of fixtures) {
    const universe = universeFor(fixture.patch.universe)
    const segments = segmentCount(fixture.definition)

    const dark: FixtureOutput = { color: { r: 0, g: 0, b: 0 }, dimmer: 0, strobing: false, pan: 128, tilt: 128 }
    let output: FixtureOutput = dark
    // Per-segment outputs for multi-head fixtures: each segment participates
    // in group effects as its own "virtual fixture", so a chase runs across a
    // pixel bar's cells and movement effects wave across a bar's heads.
    let segmentOutputs: FixtureOutput[] = []
    // Whether the fixture parks at its home position this tick: true when no
    // movement effect is aiming it AND the scene doesn't pin an explicit
    // pan/tilt (idle, blackout, or a still scene that leaves position unset).
    let restsAtHome = true

    if (scene && order && !overrides.blackout) {
      // Last matching target wins; fixtures in no target stay dark.
      const targets = scene.targets.filter((t) => targetMatches(t, fixture))
      if (targets.length > 0) {
        const target = targets[targets.length - 1]
        const movementActive = target.effect !== undefined && MOVEMENT_EFFECTS.has(target.effect.type)
        restsAtHome = !movementActive && target.pan === undefined && target.tilt === undefined
        const cellRanks = order.cellRank.get(fixture.patch.id) ?? [0]
        const totalCells = order.cellTotal.get(fixture.patch.id) ?? 1
        // Non-segmented output: a multi-pixel bar moves as one unit (fixture
        // order, so pan/tilt does not ripple per pixel); a single-head fixture
        // takes its own cell rank so its color joins the rig-wide sweep.
        const wholeIndex =
          segments > 1 ? (order.fixtureRank.get(fixture.patch.id) ?? 0) : (cellRanks[0] ?? 0)
        const wholeCount = segments > 1 ? (order.fixtureTotal.get(fixture.patch.id) ?? 1) : totalCells
        output = applyEffect(target, target.effect, wholeIndex, wholeCount, beat, audio, mod, tap, song)

        if (segments > 1) {
          for (let s = 0; s < segments; s++) {
            segmentOutputs.push(
              applyEffect(target, target.effect, cellRanks[s] ?? s, totalCells, beat, audio, mod, tap, song)
            )
          }
        }
      }
    }
    if (segments > 1 && segmentOutputs.length === 0) {
      segmentOutputs = new Array(segments).fill(output)
    }

    const applyOverrides = (out: FixtureOutput): FixtureOutput => {
      let next = out
      if (overrides.strobe && !overrides.blackout) {
        next = { ...next, color: WHITE, dimmer: 1, strobing: true }
      }
      if (overrides.blind && !overrides.blackout) {
        next = { ...next, color: WHITE, dimmer: 1 }
      }
      if (overrides.colorOverride && !overrides.blackout && next.dimmer > 0) {
        next = { ...next, color: overrides.colorOverride }
      }
      // Knob pan/tilt shift moves every moving fixture together.
      if (panShift !== 0 || tiltShift !== 0) {
        next = {
          ...next,
          pan: Math.max(0, Math.min(255, next.pan + panShift)),
          tilt: Math.max(0, Math.min(255, next.tilt + tiltShift))
        }
      }
      return next
    }
    output = applyOverrides(output)
    segmentOutputs = segmentOutputs.map(applyOverrides)

    // Per-fixture physical limits (movement arc, invert, brightness cap) are
    // applied last, so scenes stay generic and this fixture obeys its own rig.
    const limits = fixture.patch.limits
    if (limits) {
      output = applyLimits(output, limits, restsAtHome)
      segmentOutputs = segmentOutputs.map((o) => applyLimits(o, limits, restsAtHome))
    }

    const master = overrides.blackout ? 0 : overrides.masterDimmer
    const dimmer = Math.max(0, Math.min(1, output.dimmer)) * master

    writeFixture(universe, fixture, output, segmentOutputs, dimmer, master, nowMs)
  }

  return universes
}

function writeFixture(
  universe: Universe,
  fixture: PatchedFixture,
  output: FixtureOutput,
  segmentOutputs: FixtureOutput[],
  dimmer: number,
  master: number,
  nowMs: number
): void {
  const { definition, patch } = fixture
  const hasDimmerChannel = definition.channels.some((c) => c.role === 'dimmer')
  const hasStrobeChannel = definition.channels.some((c) => c.role === 'strobe')
  const hasWhiteChannel = definition.channels.some((c) => c.role === 'white')
  const isUvFixture = definition.kind === 'uv'

  // Fixtures without a hardware strobe channel simulate strobing with a
  // ~10Hz square wave on their intensity.
  const simulatedStrobeGate = output.strobing && !hasStrobeChannel ? (Math.floor(nowMs / 50) % 2 === 0 ? 1 : 0) : 1

  definition.channels.forEach((channel, offset) => {
    const address = patch.address + offset
    // Segmented channels read from their segment's output; the master
    // dimmer channel carries the base intensity for the whole fixture.
    const segOut =
      channel.segment !== undefined && segmentOutputs.length > 0
        ? segmentOutputs[Math.min(channel.segment, segmentOutputs.length - 1)]
        : output
    const segDimmer = Math.max(0, Math.min(1, segOut.dimmer)) * master
    // Fixtures without a dedicated dimmer channel bake intensity into color.
    // Segmented color channels additionally carry their own segment's
    // intensity (relative - the master dimmer channel handles the rest), so
    // chases/pulses can differ per cell despite one shared dimmer.
    const colorScale =
      (channel.segment !== undefined
        ? hasDimmerChannel
          ? Math.max(0, Math.min(1, segOut.dimmer))
          : segDimmer
        : hasDimmerChannel
          ? 1
          : segDimmer) * simulatedStrobeGate
    const { color } = segOut
    const whiteBleed = !hasWhiteChannel && color.w ? color.w : 0

    let value = 0
    switch (channel.role) {
      case 'dimmer':
        value = dimmer * 255 * simulatedStrobeGate
        break
      case 'red':
        value = Math.min(255, color.r + whiteBleed) * colorScale
        break
      case 'green':
        value = Math.min(255, color.g + whiteBleed) * colorScale
        break
      case 'blue':
        value = Math.min(255, color.b + whiteBleed) * colorScale
        break
      case 'white':
        value = (color.w ?? 0) * colorScale
        break
      case 'uv':
        // Dedicated UV fixtures run their UV emitters at scene intensity;
        // UV channels on color pars stay off unless targeted explicitly.
        value = isUvFixture ? dimmer * 255 * simulatedStrobeGate : 0
        break
      case 'amber':
        value = 0
        break
      case 'onOff':
        value = dimmer > 0.05 ? (channel.onValue ?? 255) : 0
        break
      case 'strobe':
        if (segOut.strobing && channel.strobeRange) {
          value = (channel.strobeRange.min + channel.strobeRange.max) / 2
        } else {
          value = channel.strobeOpen ?? 0
        }
        break
      case 'pan':
        value = segOut.pan
        break
      case 'tilt':
        value = segOut.tilt
        break
      case 'panFine':
      case 'tiltFine':
        value = 0
        break
      case 'colorWheel':
      case 'gobo':
        value = 0
        break
      case 'speed':
      case 'mode':
      case 'static':
        value = channel.staticValue ?? 0
        break
    }
    universe.setChannel(address, value)
  })
}
