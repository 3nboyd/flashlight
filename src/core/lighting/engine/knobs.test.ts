import { describe, it, expect } from 'vitest'
import { renderTick } from './LightingEngine'
import { BeatClock } from './BeatClock'
import { builtinFixturesById } from '../fixtures/library'
import type { PatchedFixture } from '../fixtures/types'
import type { Scene, LiveOverrides } from './types'
import { DEFAULT_OVERRIDES } from './types'
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

function overrides(partial: Partial<LiveOverrides>): LiveOverrides {
  return { ...DEFAULT_OVERRIDES, ...partial }
}

describe('knob overrides', () => {
  it('pan offset shifts a moving head left/right', () => {
    const fixtures = [patched('m', 'generic-moving-head-8ch', 1)]
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [{ group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, pan: 128, tilt: 128 }]
    }
    const center = renderTick({ fixtures, scene, beat: beatAt(0), nowMs: 0 }).get(1)!.getChannel(1)
    const right = renderTick({
      fixtures,
      scene,
      overrides: overrides({ panOffset: 0.5 }),
      beat: beatAt(0),
      nowMs: 0
    })
      .get(1)!
      .getChannel(1)
    const left = renderTick({
      fixtures,
      scene,
      overrides: overrides({ panOffset: -0.5 }),
      beat: beatAt(0),
      nowMs: 0
    })
      .get(1)!
      .getChannel(1)
    expect(center).toBe(128)
    expect(right).toBeGreaterThan(center)
    expect(left).toBeLessThan(center)
  })

  it('reactivity knob scales audio-reactive intensity', () => {
    const fixtures = [patched('p', 'generic-rgb-4ch', 1)]
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [{ group: 'all', color: { r: 255, g: 255, b: 255 }, dimmer: 1, effect: { type: 'bassPulse' } }]
    }
    const audio = { rms: 0.4, bass: 0.4, mid: 0.3, high: 0.2, onset: false, timestampMs: 0 }
    const low = renderTick({ fixtures, scene, audio, overrides: overrides({ reactivity: 0.3 }), beat: beatAt(0), nowMs: 0 })
      .get(1)!
      .getChannel(1)
    const high = renderTick({ fixtures, scene, audio, overrides: overrides({ reactivity: 2 }), beat: beatAt(0), nowMs: 0 })
      .get(1)!
      .getChannel(1)
    expect(high).toBeGreaterThan(low)
  })

  it('movement speed knob makes a circle cycle faster', () => {
    const fixtures = [patched('m', 'generic-moving-head-8ch', 1)]
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [
        { group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, pan: 128, tilt: 128, effect: { type: 'movementCircle', beats: 4 } }
      ]
    }
    // At 2x speed, the pan at t=250ms should match the 1x pan at t=500ms.
    const fast = readFixtureVisualState(
      renderTick({ fixtures, scene, overrides: overrides({ movementSpeed: 2 }), beat: beatAt(250), nowMs: 250 }).get(1)!.toBuffer(),
      fixtures[0]
    ).pan!
    const slowLater = readFixtureVisualState(
      renderTick({ fixtures, scene, beat: beatAt(500), nowMs: 500 }).get(1)!.toBuffer(),
      fixtures[0]
    ).pan!
    expect(Math.abs(fast - slowLater)).toBeLessThan(0.03)
  })
})
