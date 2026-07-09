import { describe, it, expect } from 'vitest'
import { findAddressOverlaps, fixtureFootprint, type FixturePatch } from './types'
import { BUILTIN_FIXTURES, builtinFixturesById } from './library'

describe('fixture library', () => {
  it('every builtin profile has at least one channel and a unique id', () => {
    const ids = new Set<string>()
    for (const fixture of BUILTIN_FIXTURES) {
      expect(fixture.channels.length).toBeGreaterThan(0)
      expect(ids.has(fixture.id)).toBe(false)
      ids.add(fixture.id)
    }
  })

  it('footprints match channel counts', () => {
    const rgbw = builtinFixturesById().get('generic-rgbw-8ch')!
    expect(fixtureFootprint(rgbw)).toBe(8)
  })
})

describe('findAddressOverlaps', () => {
  const defs = builtinFixturesById()

  function patch(id: string, definitionId: string, universe: number, address: number): FixturePatch {
    return { id, definitionId, label: id, universe, address }
  }

  it('flags two fixtures whose channel ranges collide in the same universe', () => {
    // RGBW par at 1 spans 1-8; RGB par at 8 spans 8-10 → overlap on channel 8.
    const overlaps = findAddressOverlaps(
      [patch('a', 'generic-rgbw-8ch', 1, 1), patch('b', 'generic-rgb-3ch', 1, 8)],
      defs
    )
    expect(overlaps).toHaveLength(1)
  })

  it('does not flag adjacent, non-overlapping fixtures', () => {
    // RGBW par at 1 spans 1-8; RGB par at 9 spans 9-11.
    const overlaps = findAddressOverlaps(
      [patch('a', 'generic-rgbw-8ch', 1, 1), patch('b', 'generic-rgb-3ch', 1, 9)],
      defs
    )
    expect(overlaps).toHaveLength(0)
  })

  it('ignores collisions across different universes', () => {
    const overlaps = findAddressOverlaps(
      [patch('a', 'generic-rgbw-8ch', 1, 1), patch('b', 'generic-rgbw-8ch', 2, 1)],
      defs
    )
    expect(overlaps).toHaveLength(0)
  })
})
