import { describe, it, expect } from 'vitest'
import { renderTick } from './LightingEngine'
import { BeatClock } from './BeatClock'
import { builtinFixturesById } from '../fixtures/library'
import type { FixtureLimits, PatchedFixture } from '../fixtures/types'
import type { Scene } from './types'
import { readFixtureVisualState } from '../visualizer/fixtureVisualState'

const defs = builtinFixturesById()

function mover(limits?: FixtureLimits): PatchedFixture {
  return {
    patch: { id: 'm', definitionId: 'generic-moving-head-8ch', label: 'm', universe: 1, address: 1, limits },
    definition: defs.get('generic-moving-head-8ch')!
  }
}

function beatAt(ms: number): ReturnType<BeatClock['positionAt']> {
  const clock = new BeatClock()
  clock.setBpm(120, 0)
  clock.resyncDownbeat(0)
  return clock.positionAt(ms)
}

const sweep: Scene = {
  id: 's',
  name: 's',
  uiColor: '#fff',
  targets: [
    { group: 'all', color: { r: 255, g: 255, b: 255 }, dimmer: 1, pan: 128, tilt: 128, effect: { type: 'movementSweep', beats: 4, amplitude: 1 } }
  ]
}

function panRange(fixture: PatchedFixture): { min: number; max: number } {
  let min = 255
  let max = 0
  for (let ms = 0; ms <= 2000; ms += 40) {
    const pan = renderTick({ fixtures: [fixture], scene: sweep, beat: beatAt(ms), nowMs: ms }).get(1)!.getChannel(1)
    min = Math.min(min, pan)
    max = Math.max(max, pan)
  }
  return { min, max }
}

describe('per-fixture movement limits', () => {
  it('a full-range sweep spans nearly the whole pan channel by default', () => {
    const { min, max } = panRange(mover())
    expect(min).toBeLessThan(40)
    expect(max).toBeGreaterThan(215)
  })

  it('confines pan to the configured window', () => {
    const { min, max } = panRange(mover({ panMin: 96, panMax: 160 }))
    expect(min).toBeGreaterThanOrEqual(95)
    expect(max).toBeLessThanOrEqual(161)
  })

  it('caps brightness with dimmerMax', () => {
    const scene: Scene = { id: 's', name: 's', uiColor: '#fff', targets: [{ group: 'all', color: { r: 0, g: 0, b: 0, w: 255 }, dimmer: 1 }] }
    const capped = mover({ dimmerMax: 0.5 })
    const state = readFixtureVisualState(
      renderTick({ fixtures: [capped], scene, beat: beatAt(0), nowMs: 0 }).get(1)!.toBuffer(),
      capped
    )
    expect(state.intensity).toBeLessThanOrEqual(0.55)
  })

  it('invertTilt mirrors the tilt output', () => {
    const scene: Scene = { id: 's', name: 's', uiColor: '#fff', targets: [{ group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, pan: 128, tilt: 200 }] }
    const normal = renderTick({ fixtures: [mover()], scene, beat: beatAt(0), nowMs: 0 }).get(1)!.getChannel(2)
    const inverted = renderTick({ fixtures: [mover({ invertTilt: true })], scene, beat: beatAt(0), nowMs: 0 }).get(1)!.getChannel(2)
    expect(normal).toBe(200)
    expect(inverted).toBe(55) // 255 - 200
  })
})

describe('beat pulse contrast', () => {
  it('hits near full on the beat and drops near black between beats', () => {
    const fixtures = [
      { patch: { id: 'p', definitionId: 'generic-rgb-4ch', label: 'p', universe: 1, address: 1 }, definition: defs.get('generic-rgb-4ch')! }
    ]
    const scene: Scene = { id: 's', name: 's', uiColor: '#fff', targets: [{ group: 'all', color: { r: 255, g: 255, b: 255 }, dimmer: 1, effect: { type: 'beatPulse', beats: 1 } }] }
    const onBeat = renderTick({ fixtures, scene, beat: beatAt(0), nowMs: 0 }).get(1)!.getChannel(1)
    const offBeat = renderTick({ fixtures, scene, beat: beatAt(430), nowMs: 430 }).get(1)!.getChannel(1) // ~0.86 into the beat
    expect(onBeat).toBeGreaterThan(240)
    expect(offBeat).toBeLessThan(30)
  })
})
