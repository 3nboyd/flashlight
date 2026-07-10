/**
 * Fixture model. A FixtureDefinition describes what a *model* of light is
 * (its channel layout); a FixturePatch places one instance of it at a DMX
 * address in a universe. Channel roles are semantic so the engine can drive
 * any fixture generically: an effect says "set color to red, dimmer to
 * 80%" and the patch resolves that to concrete channel writes.
 */

export type ChannelRole =
  | 'dimmer'
  | 'red'
  | 'green'
  | 'blue'
  | 'white'
  | 'amber'
  | 'uv'
  | 'strobe'
  | 'pan'
  | 'tilt'
  | 'panFine'
  | 'tiltFine'
  | 'colorWheel'
  | 'gobo'
  | 'speed'
  | 'mode'
  | 'onOff' // driven to onValue while the fixture is lit by a scene, 0 otherwise
  | 'static' // always output a fixed value (e.g. a mode/safety channel)

export interface ChannelSpec {
  role: ChannelRole
  /**
   * For multi-head/multi-cell fixtures (pixel bars, wave bars): which
   * segment this channel belongs to (0-based). Segmentless channels
   * (master dimmer, global strobe) apply to the whole fixture.
   */
  segment?: number
  /** For role 'static': the constant value to hold this channel at. */
  staticValue?: number
  /** For role 'onOff': value to write while lit (default 255). */
  onValue?: number
  /** For 'strobe': value range that means "strobing" on this fixture; outside it = open. */
  strobeRange?: { min: number; max: number }
  /** Value meaning "open/no strobe" for the strobe channel. */
  strobeOpen?: number
}

export type FixtureKind =
  | 'par'
  | 'wash'
  | 'strobe'
  | 'movingHead'
  | 'laser'
  | 'dimmer'
  | 'bar' // static pixel/LED bar with color segments
  | 'movingBar' // multi-head bar with per-head tilt (wave effects)
  | 'derby' // moonflower/derby cluster effect
  | 'scanner' // mirror scanner
  | 'uv' // UV cannon/blacklight
  | 'fog' // DMX-triggered fog machine
  | 'other'

/** Number of color/tilt segments a definition carries (1 for single-head fixtures). */
export function segmentCount(definition: FixtureDefinition): number {
  let max = -1
  for (const channel of definition.channels) {
    if (channel.segment !== undefined && channel.segment > max) max = channel.segment
  }
  return max + 1 || 1
}

export interface FixtureDefinition {
  id: string
  name: string
  kind: FixtureKind
  channels: ChannelSpec[]
}

export interface FixturePatch {
  id: string
  definitionId: string
  label: string
  universe: number
  /** 1-based DMX start address. */
  address: number
  /** Optional group tag so effects can target subsets ("pars", "movers"...). */
  group?: string
  /** Saved position on the visualizer stage; auto-layout applies when unset. */
  stage?: { x: number; level: 'truss' | 'floor' | 'side'; y?: number }
}

export interface PatchedFixture {
  patch: FixturePatch
  definition: FixtureDefinition
}

export function fixtureFootprint(definition: FixtureDefinition): number {
  return definition.channels.length
}

export interface AddressOverlap {
  a: FixturePatch
  b: FixturePatch
}

/** Finds patches whose channel ranges collide within the same universe. */
export function findAddressOverlaps(
  patches: FixturePatch[],
  definitionsById: Map<string, FixtureDefinition>
): AddressOverlap[] {
  const overlaps: AddressOverlap[] = []
  for (let i = 0; i < patches.length; i++) {
    for (let j = i + 1; j < patches.length; j++) {
      const a = patches[i]
      const b = patches[j]
      if (a.universe !== b.universe) continue
      const aDef = definitionsById.get(a.definitionId)
      const bDef = definitionsById.get(b.definitionId)
      if (!aDef || !bDef) continue
      const aEnd = a.address + fixtureFootprint(aDef) - 1
      const bEnd = b.address + fixtureFootprint(bDef) - 1
      if (a.address <= bEnd && b.address <= aEnd) {
        overlaps.push({ a, b })
      }
    }
  }
  return overlaps
}
