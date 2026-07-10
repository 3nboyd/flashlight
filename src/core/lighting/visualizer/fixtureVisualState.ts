import type { FixtureDefinition, FixturePatch, PatchedFixture } from '../fixtures/types'

/**
 * Inverse of the engine's channel writer: given raw universe data, recover
 * what each patched fixture is visibly doing so the stage visualizer can
 * draw it. Reads the same channel semantics the engine writes, so preview
 * and hardware can never disagree.
 */

export interface FixtureVisualState {
  patchId: string
  label: string
  kind: FixtureDefinition['kind']
  /** 0-1 blended output color. */
  r: number
  g: number
  b: number
  /** 0-1 overall intensity (dimmer channel, or color magnitude without one). */
  intensity: number
  strobing: boolean
  /** 0-1 normalized pan/tilt (0.5 = center); present only for movers. */
  pan: number | null
  tilt: number | null
}

export interface StagePosition {
  /** 0-1 across the stage, left to right. */
  x: number
  /** Mounted on the truss (pointing down) or the floor (pointing up). */
  level: 'truss' | 'floor'
}

/** Reads one fixture's visual state out of its universe's 512-byte buffer. */
export function readFixtureVisualState(
  universeData: Uint8Array,
  fixture: PatchedFixture
): FixtureVisualState {
  const { patch, definition } = fixture
  const value = (offset: number): number => universeData[patch.address - 1 + offset] ?? 0

  let dimmer: number | null = null
  let r = 0
  let g = 0
  let b = 0
  let w = 0
  let strobing = false
  let pan: number | null = null
  let tilt: number | null = null

  definition.channels.forEach((channel, offset) => {
    const v = value(offset)
    switch (channel.role) {
      case 'dimmer':
        dimmer = v / 255
        break
      case 'red':
        r = v / 255
        break
      case 'green':
        g = v / 255
        break
      case 'blue':
        b = v / 255
        break
      case 'white':
        w = v / 255
        break
      case 'strobe':
        if (channel.strobeRange && v >= channel.strobeRange.min && v <= channel.strobeRange.max) {
          strobing = true
        }
        break
      case 'pan':
        pan = v / 255
        break
      case 'tilt':
        tilt = v / 255
        break
      default:
        break
    }
  })

  // Blend white into RGB for display.
  r = Math.min(1, r + w)
  g = Math.min(1, g + w)
  b = Math.min(1, b + w)

  const colorMagnitude = Math.max(r, g, b)
  const intensity = dimmer !== null ? dimmer : colorMagnitude

  // Lasers/dimmers have no RGB: give them a display color.
  if (colorMagnitude === 0 && intensity > 0) {
    if (definition.kind === 'laser') {
      g = 1 // classic green laser
    } else {
      r = 1
      g = 0.95
      b = 0.85 // warm white
    }
  }

  return {
    patchId: patch.id,
    label: patch.label,
    kind: definition.kind,
    r,
    g,
    b,
    intensity,
    strobing,
    pan,
    tilt
  }
}

/**
 * Default stage placement when a patch has no saved position: beam fixtures
 * (movers, strobes, lasers) hang from the truss; pars/washes/dimmers are
 * floor uplights — the standard DJ/small-club arrangement. Each level
 * spreads its fixtures evenly left-to-right in patch order.
 */
export function defaultStageLayout(patches: FixturePatch[], kinds: Map<string, FixtureDefinition>): Map<string, StagePosition> {
  const layout = new Map<string, StagePosition>()
  const trussKinds = new Set(['movingHead', 'strobe', 'laser'])
  const truss: FixturePatch[] = []
  const floor: FixturePatch[] = []

  for (const patch of patches) {
    const kind = kinds.get(patch.definitionId)?.kind ?? 'par'
    ;(trussKinds.has(kind) ? truss : floor).push(patch)
  }
  const spread = (list: FixturePatch[], level: 'truss' | 'floor'): void => {
    list.forEach((patch, i) => {
      layout.set(patch.id, { x: (i + 1) / (list.length + 1), level })
    })
  }
  spread(truss, 'truss')
  spread(floor, 'floor')
  return layout
}

/** Saved position if present, otherwise the auto-layout default. */
export function resolveStagePositions(
  patches: FixturePatch[],
  kinds: Map<string, FixtureDefinition>
): Map<string, StagePosition> {
  const layout = defaultStageLayout(
    patches.filter((p) => !p.stage),
    kinds
  )
  for (const patch of patches) {
    if (patch.stage) layout.set(patch.id, patch.stage)
  }
  return layout
}
