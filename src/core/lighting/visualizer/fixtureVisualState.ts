import { segmentCount, type FixtureDefinition, type FixturePatch, type PatchedFixture } from '../fixtures/types'

/**
 * Inverse of the engine's channel writer: given raw universe data, recover
 * what each patched fixture is visibly doing so the stage visualizer can
 * draw it. Reads the same channel semantics the engine writes, so preview
 * and hardware can never disagree.
 */

export interface SegmentVisualState {
  r: number
  g: number
  b: number
  intensity: number
  /** 0-1 normalized tilt (0.5 = center); null for static segments. */
  tilt: number | null
}

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
  /** Per-cell states for multi-head fixtures (pixel bars, wave bars). */
  segments: SegmentVisualState[] | null
}

export interface StagePosition {
  /** 0-1 across the stage, left to right. */
  x: number
  /**
   * Mount: top truss (pointing down), floor (pointing up), or the side of
   * a vertical truss (pointing across the stage).
   */
  level: 'truss' | 'floor' | 'side'
  /** 0-1 height along a vertical truss; only meaningful for level 'side'. */
  y?: number
}

/** Reads one fixture's visual state out of its universe's 512-byte buffer. */
export function readFixtureVisualState(
  universeData: Uint8Array,
  fixture: PatchedFixture
): FixtureVisualState {
  const { patch, definition } = fixture
  const value = (offset: number): number => universeData[patch.address - 1 + offset] ?? 0
  const segCount = segmentCount(definition)

  let dimmer: number | null = null
  let r = 0
  let g = 0
  let b = 0
  let w = 0
  let uv = 0
  let onOff = 0
  let strobing = false
  let pan: number | null = null
  let tilt: number | null = null
  const segs: SegmentVisualState[] | null =
    segCount > 1
      ? Array.from({ length: segCount }, () => ({ r: 0, g: 0, b: 0, intensity: 0, tilt: null }))
      : null
  const segWhite = segCount > 1 ? new Array<number>(segCount).fill(0) : null

  definition.channels.forEach((channel, offset) => {
    const v = value(offset)
    const seg = channel.segment !== undefined && segs ? segs[channel.segment] : null
    switch (channel.role) {
      case 'dimmer':
        dimmer = v / 255
        break
      case 'red':
        if (seg) seg.r = v / 255
        else r = v / 255
        break
      case 'green':
        if (seg) seg.g = v / 255
        else g = v / 255
        break
      case 'blue':
        if (seg) seg.b = v / 255
        else b = v / 255
        break
      case 'white':
        if (seg && segWhite && channel.segment !== undefined) segWhite[channel.segment] = v / 255
        else w = v / 255
        break
      case 'uv':
        uv = Math.max(uv, v / 255)
        break
      case 'onOff':
        onOff = v >= (channel.onValue ?? 255) * 0.5 ? 1 : 0
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
        if (seg) seg.tilt = v / 255
        else tilt = v / 255
        break
      default:
        break
    }
  })

  // Blend white into RGB and finalize segments.
  if (segs && segWhite) {
    segs.forEach((seg, i) => {
      seg.r = Math.min(1, seg.r + segWhite[i])
      seg.g = Math.min(1, seg.g + segWhite[i])
      seg.b = Math.min(1, seg.b + segWhite[i])
      const magnitude = Math.max(seg.r, seg.g, seg.b)
      seg.intensity = (dimmer !== null ? dimmer : 1) * magnitude
    })
  }
  r = Math.min(1, r + w)
  g = Math.min(1, g + w)
  b = Math.min(1, b + w)

  // UV fixtures glow violet at their UV level.
  if (uv > 0 && Math.max(r, g, b) === 0) {
    r = 0.45
    g = 0.1
    b = 1
    if (dimmer === null) dimmer = uv
  }

  const segMax = segs ? Math.max(...segs.map((s) => s.intensity)) : 0
  const colorMagnitude = Math.max(r, g, b, segMax)
  let intensity = dimmer !== null ? dimmer * Math.max(colorMagnitude, uv > 0 ? uv : 1) : colorMagnitude

  // onOff fixtures (lasers) are simply on or off.
  if (definition.channels.some((c) => c.role === 'onOff')) {
    intensity = onOff
  }

  // Fixtures with no RGB at all get a display color.
  if (Math.max(r, g, b) === 0 && intensity > 0) {
    if (definition.kind === 'laser') {
      g = 1 // classic green laser
    } else {
      r = 1
      g = 0.95
      b = 0.85 // warm white
    }
  }

  // Representative color for segmented fixtures = brightest segment.
  if (segs && segMax > 0) {
    const brightest = segs.reduce((a, c) => (c.intensity > a.intensity ? c : a))
    r = brightest.r
    g = brightest.g
    b = brightest.b
  }

  return {
    patchId: patch.id,
    label: patch.label,
    kind: definition.kind,
    r,
    g,
    b,
    intensity: Math.max(0, Math.min(1, intensity)),
    strobing,
    pan,
    tilt,
    segments: segs
  }
}

/**
 * Default stage placement when a patch has no saved position: beam fixtures
 * (movers, strobes, lasers, wave bars, derbies, scanners) hang from the
 * truss; pars/washes/bars/UV/fog sit on the floor — the standard
 * DJ/small-club arrangement. Each level spreads its fixtures evenly
 * left-to-right in patch order.
 */
export function defaultStageLayout(
  patches: FixturePatch[],
  kinds: Map<string, FixtureDefinition>
): Map<string, StagePosition> {
  const layout = new Map<string, StagePosition>()
  const trussKinds = new Set(['movingHead', 'strobe', 'laser', 'movingBar', 'derby', 'scanner'])
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
