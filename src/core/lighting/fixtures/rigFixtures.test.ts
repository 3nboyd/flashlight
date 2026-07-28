import { describe, it, expect } from 'vitest'
import { builtinFixturesById } from './library'
import { fixtureFootprint, segmentCount, type PatchedFixture } from './types'
import { renderTick } from '../engine/LightingEngine'
import { BeatClock } from '../engine/BeatClock'
import { DEFAULT_OVERRIDES, type Scene } from '../engine/types'

const defs = builtinFixturesById()

function patched(definitionId: string, address = 1): PatchedFixture {
  return {
    patch: { id: 'f', definitionId, label: definitionId, universe: 1, address },
    definition: defs.get(definitionId)!
  }
}

function beatAt(ms: number): ReturnType<BeatClock['positionAt']> {
  const clock = new BeatClock()
  clock.setBpm(120, 0)
  clock.resyncDownbeat(0)
  return clock.positionAt(ms)
}

describe('RGB Strobe Panel (11ch manual mode)', () => {
  const fixture = patched('rgbw-strobe-panel-11ch')

  it('has an 11-channel footprint with the effect-macro channels pinned to 0', () => {
    expect(fixtureFootprint(fixture.definition)).toBe(11)
    // Channels 7-11 are the fixture's own macro selectors; all held static 0.
    for (let i = 6; i < 11; i++) {
      expect(fixture.definition.channels[i]).toEqual({ role: 'static', staticValue: 0 })
    }
  })

  it('maps dimmer + color directly and keeps macros silent', () => {
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#f00',
      targets: [{ group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1 }]
    }
    const u = renderTick({ fixtures: [fixture], scene, beat: beatAt(0), nowMs: 0 }).get(1)!
    expect(u.getChannel(1)).toBe(255) // master dimmer
    expect(u.getChannel(2)).toBe(255) // red
    expect(u.getChannel(3)).toBe(0) // green
    expect(u.getChannel(6)).toBe(0) // no strobe
    expect(u.getChannel(7)).toBe(0) // effect mode stays in manual
  })

  it('drives the strobe channel into its strobing range on the global strobe', () => {
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [{ group: 'all', color: { r: 255, g: 255, b: 255 }, dimmer: 1 }]
    }
    const u = renderTick({
      fixtures: [fixture],
      scene,
      overrides: { ...DEFAULT_OVERRIDES, strobe: true },
      beat: beatAt(0),
      nowMs: 0
    }).get(1)!
    expect(u.getChannel(6)).toBeGreaterThanOrEqual(8) // within strobeRange min..max
  })
})

describe('10-Pixel RGBW Beam Bar (43ch)', () => {
  const fixture = patched('rgbw-beam-bar-10px-43ch')

  it('is a 43-channel fixture with 10 addressable pixels', () => {
    expect(fixtureFootprint(fixture.definition)).toBe(43)
    expect(segmentCount(fixture.definition)).toBe(10)
    expect(fixture.definition.channels[42]).toEqual({ role: 'static', staticValue: 0 }) // reset pinned
  })

  it('runs a chase across the pixels (cells differ)', () => {
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#f00',
      targets: [
        {
          group: 'all',
          color: { r: 255, g: 0, b: 0 },
          dimmer: 1,
          effect: { type: 'chase', beats: 1, colors: [{ r: 255, g: 0, b: 0 }] }
        }
      ]
    }
    const u = renderTick({ fixtures: [fixture], scene, beat: beatAt(0), nowMs: 0 }).get(1)!
    // Pixel N red channel = 3 + (N-1)*4. At beat 0 one cell is lit, the rest dark.
    const pixelReds = Array.from({ length: 10 }, (_, i) => u.getChannel(3 + i * 4))
    expect(new Set(pixelReds).size).toBeGreaterThan(1)
    expect(Math.max(...pixelReds)).toBe(255)
    expect(Math.min(...pixelReds)).toBe(0)
  })

  it('tilts the whole bar together under a nod effect', () => {
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [
        {
          group: 'all',
          color: { r: 255, g: 255, b: 255 },
          dimmer: 1,
          tilt: 128,
          effect: { type: 'movementNod', beats: 4, amplitude: 0.8 }
        }
      ]
    }
    const centered = renderTick({ fixtures: [fixture], scene, beat: beatAt(0), nowMs: 0 }).get(1)!.getChannel(1)
    const nodded = renderTick({ fixtures: [fixture], scene, beat: beatAt(500), nowMs: 500 }).get(1)!.getChannel(1)
    expect(centered).toBe(128) // tilt channel at rest
    expect(nodded).toBeGreaterThan(150) // and swings on the beat
  })
})
