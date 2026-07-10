import { Universe } from '../dmx/Universe'
import { segmentCount, type PatchedFixture } from '../fixtures/types'
import type { AudioFeatures } from '../audio/features'
import { SILENT_FEATURES } from '../audio/features'
import type { BeatPosition } from './BeatClock'
import type { LiveOverrides, Rgbw, Scene, SceneTarget, EffectSettings } from './types'
import { DEFAULT_OVERRIDES } from './types'

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
 * accumulated state — so ticks are deterministic and testable.
 */
function applyEffect(
  target: SceneTarget,
  effect: EffectSettings | undefined,
  fixtureIndex: number,
  fixtureCount: number,
  beat: BeatPosition,
  audio: AudioFeatures
): FixtureOutput {
  const base: FixtureOutput = {
    color: target.color,
    dimmer: target.dimmer,
    strobing: false,
    pan: target.pan ?? 128,
    tilt: target.tilt ?? 128
  }
  if (!effect || effect.type === 'static') return base

  const beats = effect.beats ?? 4
  const palette = effect.colors && effect.colors.length > 0 ? effect.colors : [target.color]

  switch (effect.type) {
    case 'beatPulse': {
      // Full brightness on the beat, exponential-ish decay into the next.
      const envelope = Math.pow(1 - beat.beatPhase, 2)
      return { ...base, dimmer: target.dimmer * (0.15 + 0.85 * envelope) }
    }
    case 'breathe': {
      // Slow sine swell across the cycle — never fully dark.
      const swell = 0.5 - 0.5 * Math.cos((beat.beat / beats) * 2 * Math.PI)
      return { ...base, dimmer: target.dimmer * (0.25 + 0.75 * swell) }
    }
    case 'colorCycle': {
      const step = Math.floor(beat.beat / beats) % palette.length
      return { ...base, color: palette[step] }
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
    case 'strobe':
      return { ...base, strobing: true, color: palette[0], dimmer: target.dimmer }
    case 'audioLevel':
      return { ...base, dimmer: target.dimmer * Math.min(1, audio.rms * 1.4) }
    case 'bassPulse':
      return { ...base, dimmer: target.dimmer * Math.min(1, audio.bass * 1.3) }
    case 'movementCircle': {
      const amplitude = (effect.amplitude ?? 0.5) * 127
      // Phase-offset across the group so multiple heads (or the segments of
      // a wave bar) ripple instead of moving in lockstep.
      const spread = fixtureCount > 1 ? (fixtureIndex / fixtureCount) * Math.PI : 0
      const angle = (beat.beat / beats) * 2 * Math.PI + spread
      return {
        ...base,
        pan: (target.pan ?? 128) + Math.sin(angle) * amplitude,
        tilt: (target.tilt ?? 128) + Math.cos(angle) * amplitude * 0.6
      }
    }
    case 'movementSweep': {
      const amplitude = (effect.amplitude ?? 0.5) * 127
      const spread = fixtureCount > 1 ? (fixtureIndex / fixtureCount) * Math.PI : 0
      const angle = (beat.beat / beats) * 2 * Math.PI + spread
      return {
        ...base,
        pan: (target.pan ?? 128) + Math.sin(angle) * amplitude,
        tilt: (target.tilt ?? 128) + Math.sin(angle) * amplitude * 0.5
      }
    }
    case 'movementFigure8': {
      // Lissajous 2:1 — the classic infinity trace.
      const amplitude = (effect.amplitude ?? 0.5) * 127
      const spread = fixtureCount > 1 ? (fixtureIndex / fixtureCount) * Math.PI : 0
      const angle = (beat.beat / beats) * 2 * Math.PI + spread
      return {
        ...base,
        pan: (target.pan ?? 128) + Math.sin(angle) * amplitude,
        tilt: (target.tilt ?? 128) + Math.sin(angle * 2) * amplitude * 0.55
      }
    }
    case 'movementNod': {
      // Tilt-only wave: beams nod up/down, rippling across the group.
      const amplitude = (effect.amplitude ?? 0.5) * 127
      const spread = fixtureCount > 1 ? (fixtureIndex / fixtureCount) * Math.PI : 0
      const angle = (beat.beat / beats) * 2 * Math.PI + spread
      return { ...base, tilt: (target.tilt ?? 128) + Math.sin(angle) * amplitude * 0.7 }
    }
    case 'movementRandom': {
      // Ballyhoo: each head jumps to a new pseudo-random position every N
      // beats — deterministic per (step, fixture) so ticks agree.
      const amplitude = (effect.amplitude ?? 0.5) * 127
      const step = Math.floor(beat.beat / beats)
      const hashOf = (salt: number): number => {
        const v = Math.abs(Math.sin(step * 12.9898 + fixtureIndex * 78.233 + salt)) * 43758.5453
        return (v - Math.floor(v)) * 2 - 1 // -1..1
      }
      return {
        ...base,
        pan: (target.pan ?? 128) + hashOf(1) * amplitude,
        tilt: (target.tilt ?? 128) + hashOf(7) * amplitude * 0.6
      }
    }
    default:
      return base
  }
}

function targetMatches(target: SceneTarget, fixture: PatchedFixture): boolean {
  if (target.group === 'all') return true
  if (target.group.startsWith('kind:')) {
    return fixture.definition.kind === target.group.slice(5)
  }
  return fixture.patch.group === target.group
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
}): Map<number, Universe> {
  const { fixtures, scene, beat, nowMs } = options
  const overrides = options.overrides ?? DEFAULT_OVERRIDES
  const audio = options.audio ?? SILENT_FEATURES

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

    if (scene && !overrides.blackout) {
      // Last matching target wins; fixtures in no target stay dark.
      const targets = scene.targets.filter((t) => targetMatches(t, fixture))
      if (targets.length > 0) {
        const target = targets[targets.length - 1]
        const groupFixtures = fixtures.filter((f) => targetMatches(target, f))
        const indexInGroup = groupFixtures.findIndex((f) => f.patch.id === fixture.patch.id)
        output = applyEffect(target, target.effect, indexInGroup, groupFixtures.length, beat, audio)

        if (segments > 1) {
          let segmentBase = 0
          for (let i = 0; i < indexInGroup; i++) {
            segmentBase += segmentCount(groupFixtures[i].definition)
          }
          const totalSegments = groupFixtures.reduce((sum, f) => sum + segmentCount(f.definition), 0)
          for (let s = 0; s < segments; s++) {
            segmentOutputs.push(
              applyEffect(target, target.effect, segmentBase + s, totalSegments, beat, audio)
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
      if (overrides.colorOverride && !overrides.blackout && next.dimmer > 0) {
        next = { ...next, color: overrides.colorOverride }
      }
      return next
    }
    output = applyOverrides(output)
    segmentOutputs = segmentOutputs.map(applyOverrides)

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
    // intensity (relative — the master dimmer channel handles the rest), so
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
