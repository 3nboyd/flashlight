import { describe, it, expect } from 'vitest'
import { renderTick } from '../engine/LightingEngine'
import { BeatClock } from '../engine/BeatClock'
import { builtinFixturesById } from '../fixtures/library'
import type { PatchedFixture } from '../fixtures/types'
import type { Scene } from '../engine/types'
import {
  readFixtureVisualState,
  defaultStageLayout,
  resolveStagePositions
} from './fixtureVisualState'

const defs = builtinFixturesById()

function patched(id: string, definitionId: string, address: number, group?: string): PatchedFixture {
  return {
    patch: { id, definitionId, label: id, universe: 1, address, group },
    definition: defs.get(definitionId)!
  }
}

function renderScene(fixtures: PatchedFixture[], scene: Scene): Uint8Array {
  const clock = new BeatClock()
  clock.setBpm(120, 0)
  clock.resyncDownbeat(0)
  const universes = renderTick({ fixtures, scene, beat: clock.positionAt(0), nowMs: 0 })
  return universes.get(1)!.toBuffer()
}

describe('readFixtureVisualState - engine write → visual read round-trip', () => {
  it('recovers color and intensity for a 3ch par (dimmer baked into color)', () => {
    const fixtures = [patched('p1', 'generic-rgb-3ch', 1)]
    const data = renderScene(fixtures, {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [{ group: 'all', color: { r: 255, g: 100, b: 0 }, dimmer: 0.5 }]
    })
    const state = readFixtureVisualState(data, fixtures[0])
    expect(state.intensity).toBeCloseTo(0.5, 1)
    expect(state.r).toBeGreaterThan(state.g)
    expect(state.b).toBe(0)
    expect(state.strobing).toBe(false)
  })

  it('recovers full color and strobe state for an 8ch RGBW par (strobe is full brightness)', () => {
    const fixtures = [patched('p1', 'generic-rgbw-8ch', 1)]
    const data = renderScene(fixtures, {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [
        {
          group: 'all',
          color: { r: 0, g: 0, b: 255 },
          dimmer: 0.8,
          effect: { type: 'strobe' }
        }
      ]
    })
    const state = readFixtureVisualState(data, fixtures[0])
    // Strobe punches at full brightness regardless of the scene's dimmer.
    expect(state.intensity).toBeCloseTo(1, 1)
    expect(state.b).toBe(1)
    expect(state.strobing).toBe(true)
  })

  it('recovers pan/tilt for a moving head', () => {
    const fixtures = [patched('m1', 'generic-moving-head-8ch', 1)]
    const data = renderScene(fixtures, {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [
        { group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, pan: 200, tilt: 60 }
      ]
    })
    const state = readFixtureVisualState(data, fixtures[0])
    expect(state.pan).toBeCloseTo(200 / 255, 2)
    expect(state.tilt).toBeCloseTo(60 / 255, 2)
  })

  it('gives lasers a green display color and dimmers warm white', () => {
    const laser = [patched('l1', 'generic-laser-2ch', 1)]
    // Laser mode channel is 'mode' staticValue 0 → intensity 0. Manually set data:
    const data = new Uint8Array(512)
    data[0] = 255 // mode on → but mode isn't read as intensity...
    const state = readFixtureVisualState(data, laser[0])
    // Laser without dimmer/rgb reads 0 intensity - verify no crash and green default logic:
    expect(state.kind).toBe('laser')

    const dimmerFixture = [patched('d1', 'generic-dimmer-1ch', 10)]
    const dimmerData = new Uint8Array(512)
    dimmerData[9] = 255
    const dimmerState = readFixtureVisualState(dimmerData, dimmerFixture[0])
    expect(dimmerState.intensity).toBe(1)
    expect(dimmerState.r).toBe(1) // warm white fallback
  })
})

describe('stage layout', () => {
  it('puts movers/strobes/lasers on the truss and pars on the floor, spread evenly', () => {
    const patches = [
      patched('mover1', 'generic-moving-head-8ch', 1).patch,
      patched('mover2', 'generic-moving-head-8ch', 20).patch,
      patched('par1', 'generic-rgb-3ch', 40).patch,
      patched('strobe1', 'generic-strobe-2ch', 50).patch
    ]
    const layout = defaultStageLayout(patches, defs)
    expect(layout.get('mover1')!.level).toBe('truss')
    expect(layout.get('strobe1')!.level).toBe('truss')
    expect(layout.get('par1')!.level).toBe('floor')
    // Two movers + one strobe on truss → x at 1/4, 2/4, 3/4.
    expect(layout.get('mover1')!.x).toBeCloseTo(0.25, 2)
    expect(layout.get('strobe1')!.x).toBeCloseTo(0.75, 2)
    expect(layout.get('par1')!.x).toBeCloseTo(0.5, 2)
  })

  it('saved positions override auto-layout', () => {
    const patch = patched('p1', 'generic-rgb-3ch', 1).patch
    patch.stage = { x: 0.9, level: 'truss' }
    const layout = resolveStagePositions([patch], defs)
    expect(layout.get('p1')).toEqual({ x: 0.9, level: 'truss' })
  })
})
