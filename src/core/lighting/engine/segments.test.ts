import { describe, it, expect } from 'vitest'
import { renderTick } from './LightingEngine'
import { BeatClock } from './BeatClock'
import { builtinFixturesById } from '../fixtures/library'
import { segmentCount, type PatchedFixture } from '../fixtures/types'
import type { Scene } from './types'
import { readFixtureVisualState } from '../visualizer/fixtureVisualState'

const defs = builtinFixturesById()

function patched(id: string, definitionId: string, address: number): PatchedFixture {
  return {
    patch: { id, definitionId, label: id, universe: 1, address },
    definition: defs.get(definitionId)!
  }
}

function beatAt(ms: number): ReturnType<BeatClock['positionAt']> {
  const clock = new BeatClock()
  clock.setBpm(120, 0)
  clock.resyncDownbeat(0)
  return clock.positionAt(ms)
}

function scene(targets: Scene['targets']): Scene {
  return { id: 's', name: 's', uiColor: '#fff', targets }
}

describe('multi-segment fixtures', () => {
  it('pixel bar profile reports 8 segments; wave bar 5', () => {
    expect(segmentCount(defs.get('generic-pixel-bar-8seg-26ch')!)).toBe(8)
    expect(segmentCount(defs.get('generic-moving-bar-5head-27ch')!)).toBe(5)
    expect(segmentCount(defs.get('generic-rgb-3ch')!)).toBe(1)
  })

  it('a chase runs across a pixel bar cell by cell', () => {
    const fixtures = [patched('bar', 'generic-pixel-bar-8seg-26ch', 1)]
    const s = scene([
      { group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, effect: { type: 'chase', beats: 1 } }
    ])
    const universes = renderTick({ fixtures, scene: s, beat: beatAt(0), nowMs: 0 })
    const state = readFixtureVisualState(universes.get(1)!.toBuffer(), fixtures[0])

    expect(state.segments).toHaveLength(8)
    const lit = state.segments!.filter((seg) => seg.intensity > 0.1)
    expect(lit).toHaveLength(1) // exactly one cell lit at a time
  })

  it('rainbow spreads different hues across a pixel bar', () => {
    const fixtures = [patched('bar', 'generic-pixel-bar-8seg-26ch', 1)]
    const s = scene([
      { group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, effect: { type: 'rainbow', beats: 16 } }
    ])
    const universes = renderTick({ fixtures, scene: s, beat: beatAt(0), nowMs: 0 })
    const state = readFixtureVisualState(universes.get(1)!.toBuffer(), fixtures[0])

    const hues = new Set(
      state.segments!.map((seg) => `${Math.round(seg.r * 4)}-${Math.round(seg.g * 4)}-${Math.round(seg.b * 4)}`)
    )
    expect(hues.size).toBeGreaterThan(3) // visibly different colors per cell
  })

  it('movementSweep gives each wave-bar head a different tilt (the wave)', () => {
    const fixtures = [patched('wave', 'generic-moving-bar-5head-27ch', 1)]
    const s = scene([
      {
        group: 'all',
        color: { r: 0, g: 0, b: 255 },
        dimmer: 1,
        tilt: 128,
        effect: { type: 'movementSweep', beats: 4, amplitude: 0.8 }
      }
    ])
    const universes = renderTick({ fixtures, scene: s, beat: beatAt(250), nowMs: 250 })
    const state = readFixtureVisualState(universes.get(1)!.toBuffer(), fixtures[0])

    const tilts = state.segments!.map((seg) => seg.tilt)
    expect(tilts.every((t) => t !== null)).toBe(true)
    expect(new Set(tilts.map((t) => Math.round(t! * 100))).size).toBeGreaterThan(2)
  })

  it('static color scenes light all segments uniformly', () => {
    const fixtures = [patched('bar', 'generic-pixel-bar-4seg-14ch', 1)]
    const s = scene([{ group: 'all', color: { r: 0, g: 255, b: 0 }, dimmer: 1 }])
    const universes = renderTick({ fixtures, scene: s, beat: beatAt(0), nowMs: 0 })
    const state = readFixtureVisualState(universes.get(1)!.toBuffer(), fixtures[0])
    expect(state.segments!.every((seg) => seg.g === 1 && seg.intensity === 1)).toBe(true)
  })
})

describe('laser onOff + UV fixtures', () => {
  it('laser turns on (onValue) when a scene lights it and reads as lit', () => {
    const fixtures = [patched('laser', 'generic-laser-2ch', 1)]
    const s = scene([{ group: 'all', color: { r: 0, g: 255, b: 0 }, dimmer: 1 }])
    const universes = renderTick({ fixtures, scene: s, beat: beatAt(0), nowMs: 0 })
    const data = universes.get(1)!.toBuffer()
    expect(data[0]).toBe(255) // onOff channel driven to onValue

    const state = readFixtureVisualState(data, fixtures[0])
    expect(state.intensity).toBe(1)
    expect(state.g).toBe(1) // green display color
  })

  it('laser is off with no scene', () => {
    const fixtures = [patched('laser', 'generic-laser-2ch', 1)]
    const universes = renderTick({ fixtures, scene: null, beat: beatAt(0), nowMs: 0 })
    const data = universes.get(1)!.toBuffer()
    expect(data[0]).toBe(0)
    expect(readFixtureVisualState(data, fixtures[0]).intensity).toBe(0)
  })

  it('UV cannon runs its UV channel at scene intensity and reads violet', () => {
    const fixtures = [patched('uv', 'generic-uv-2ch', 1)]
    const s = scene([{ group: 'all', color: { r: 255, g: 255, b: 255 }, dimmer: 0.8 }])
    const universes = renderTick({ fixtures, scene: s, beat: beatAt(0), nowMs: 0 })
    const data = universes.get(1)!.toBuffer()
    expect(data[0]).toBe(204) // 0.8 * 255

    const state = readFixtureVisualState(data, fixtures[0])
    expect(state.intensity).toBeGreaterThan(0.7)
    expect(state.b).toBeGreaterThan(state.g) // violet-ish
  })

  it('UV channel on a color par stays off (no accidental blacklight)', () => {
    const fixtures = [patched('par', 'generic-rgbaw-uv-6ch', 1)]
    const s = scene([{ group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1 }])
    const universes = renderTick({ fixtures, scene: s, beat: beatAt(0), nowMs: 0 })
    expect(universes.get(1)!.toBuffer()[5]).toBe(0) // uv channel
  })
})
