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
  | 'static' // always output a fixed value (e.g. a mode/safety channel)

export interface ChannelSpec {
  role: ChannelRole
  /** For role 'static': the constant value to hold this channel at. */
  staticValue?: number
  /** For 'strobe': value range that means "strobing" on this fixture; outside it = open. */
  strobeRange?: { min: number; max: number }
  /** Value meaning "open/no strobe" for the strobe channel. */
  strobeOpen?: number
}

export type FixtureKind = 'par' | 'wash' | 'strobe' | 'movingHead' | 'laser' | 'dimmer' | 'other'

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
  stage?: { x: number; level: 'truss' | 'floor' }
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
