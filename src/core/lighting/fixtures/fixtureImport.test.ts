import { describe, it, expect } from 'vitest'
import { parseFixtureImport } from './fixtureImport'
import { fixtureFootprint, segmentCount } from './types'

describe('parseFixtureImport', () => {
  it('imports an explicit channel list (role strings + objects)', () => {
    const { fixture, error } = parseFixtureImport(
      JSON.stringify({
        name: 'RGBW Par (5ch)',
        kind: 'par',
        channels: ['dimmer', 'red', 'green', 'blue', { role: 'strobe', strobeOpen: 0, strobeRange: { min: 10, max: 255 } }]
      })
    )
    expect(error).toBeUndefined()
    expect(fixture).toBeDefined()
    expect(fixtureFootprint(fixture!)).toBe(5)
    expect(fixture!.channels[4].strobeRange).toEqual({ min: 10, max: 255 })
  })

  it('expands the pixels shorthand into segmented channels (the 165ch panel)', () => {
    const { fixture, error } = parseFixtureImport(
      JSON.stringify({
        name: 'RGB+White Panel (165ch)',
        kind: 'strobe',
        pixels: [
          { count: 45, channels: ['red', 'green', 'blue'] },
          { count: 30, channels: ['white'] }
        ]
      })
    )
    expect(error).toBeUndefined()
    expect(fixtureFootprint(fixture!)).toBe(45 * 3 + 30) // 165 channels
    expect(segmentCount(fixture!)).toBe(75) // 45 RGB + 30 white pixels
    // First pixel's red is segment 0; the first white LED is segment 45.
    expect(fixture!.channels[0]).toEqual({ role: 'red', segment: 0 })
    expect(fixture!.channels[135]).toEqual({ role: 'white', segment: 45 })
  })

  it('reports clear errors instead of importing bad data', () => {
    expect(parseFixtureImport('not json').error).toMatch(/not valid json/i)
    expect(parseFixtureImport(JSON.stringify({ kind: 'par', channels: ['red'] })).error).toMatch(/name/i)
    expect(parseFixtureImport(JSON.stringify({ name: 'x', kind: 'spaceship', channels: ['red'] })).error).toMatch(/kind/i)
    expect(parseFixtureImport(JSON.stringify({ name: 'x', kind: 'par', channels: ['reddd'] })).error).toMatch(/unknown role/i)
    expect(parseFixtureImport(JSON.stringify({ name: 'x', kind: 'par' })).error).toMatch(/channels.*pixels/i)
  })
})
