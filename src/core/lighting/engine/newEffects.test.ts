import { describe, it, expect } from 'vitest'
import { renderTick } from './LightingEngine'
import { BeatClock } from './BeatClock'
import { builtinFixturesById } from '../fixtures/library'
import type { PatchedFixture } from '../fixtures/types'
import type { Scene, EffectSettings, Rgbw } from './types'
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

function sceneWith(effect: EffectSettings, extras: Partial<Scene['targets'][0]> = {}): Scene {
  return {
    id: 's',
    name: 's',
    uiColor: '#fff',
    targets: [
      { group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, pan: 128, tilt: 128, effect, ...extras }
    ]
  }
}

describe('new intensity/color effects', () => {
  it('breathe swells smoothly and never goes fully dark', () => {
    const fixtures = [patched('p', 'generic-rgb-4ch', 1)]
    const scene = sceneWith({ type: 'breathe', beats: 4 })
    const levels: number[] = []
    // 4 beats at 120bpm = 2000ms cycle.
    for (const ms of [0, 500, 1000, 1500]) {
      const u = renderTick({ fixtures, scene, beat: beatAt(ms), nowMs: ms }).get(1)!
      levels.push(u.getChannel(1))
    }
    expect(Math.max(...levels)).toBeGreaterThan(200) // reaches near-full mid-cycle
    expect(Math.min(...levels)).toBeGreaterThan(40) // floor, not blackout
    expect(new Set(levels).size).toBeGreaterThan(2) // actually moving
  })

  it('alternate flips odd/even fixtures between two colors on the beat', () => {
    const fixtures = [patched('a', 'generic-rgb-3ch', 1), patched('b', 'generic-rgb-3ch', 4)]
    const scene = sceneWith({
      type: 'alternate',
      beats: 1,
      colors: [
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 0, b: 255 }
      ]
    })
    const at0 = renderTick({ fixtures, scene, beat: beatAt(0), nowMs: 0 }).get(1)!
    expect(at0.getChannel(1)).toBe(255) // fixture a: red
    expect(at0.getChannel(6)).toBe(255) // fixture b: blue
    const at1 = renderTick({ fixtures, scene, beat: beatAt(500), nowMs: 500 }).get(1)! // next beat
    expect(at1.getChannel(3)).toBe(255) // fixture a: blue now
    expect(at1.getChannel(4)).toBe(255) // fixture b: red now
  })

  it('sparkle lights a subset that changes across subdivisions, deterministically', () => {
    const fixtures = Array.from({ length: 8 }, (_, i) => patched(`p${i}`, 'generic-rgb-4ch', 1 + i * 4))
    const scene = sceneWith({ type: 'sparkle' })
    const litAt = (ms: number): string =>
      fixtures.map((f) => (renderTick({ fixtures, scene, beat: beatAt(ms), nowMs: ms }).get(1)!.getChannel(f.patch.address) > 128 ? '1' : '0')).join('')
    const a = litAt(0)
    const b = litAt(125) // next 16th at 120bpm
    expect(litAt(0)).toBe(a) // deterministic per tick
    expect(a).not.toBe(b) // pattern changes across subdivisions
    expect(a).toContain('0') // not everything lit
  })
})

describe('new movement effects', () => {
  const mover = [patched('m', 'generic-moving-head-8ch', 1)]

  function panTiltAt(effect: EffectSettings, ms: number): { pan: number; tilt: number } {
    const scene = sceneWith(effect)
    const u = renderTick({ fixtures: mover, scene, beat: beatAt(ms), nowMs: ms }).get(1)!
    const state = readFixtureVisualState(u.toBuffer(), mover[0])
    return { pan: state.pan! * 255, tilt: state.tilt! * 255 }
  }

  it('figure-8 traces a 2:1 lissajous (tilt completes twice per pan cycle)', () => {
    const eff: EffectSettings = { type: 'movementFigure8', beats: 4, amplitude: 0.8 }
    const quarter = panTiltAt(eff, 500) // quarter cycle
    const half = panTiltAt(eff, 1000) // half cycle
    expect(quarter.pan).toBeGreaterThan(200) // pan at +max
    expect(Math.abs(quarter.tilt - 128)).toBeLessThan(8) // tilt back at center (2x freq)
    expect(Math.abs(half.pan - 128)).toBeLessThan(8) // pan back at center
  })

  it('nod moves tilt only, leaving pan at base', () => {
    const eff: EffectSettings = { type: 'movementNod', beats: 4, amplitude: 0.8 }
    const p = panTiltAt(eff, 500)
    expect(Math.abs(p.pan - 128)).toBeLessThan(2)
    expect(Math.abs(p.tilt - 128)).toBeGreaterThan(40)
  })

  it('random jumps to a new position each step but is stable within a step', () => {
    const eff: EffectSettings = { type: 'movementRandom', beats: 1, amplitude: 0.8 }
    const early = panTiltAt(eff, 100)
    const sameStep = panTiltAt(eff, 300) // still beat 0
    const nextStep = panTiltAt(eff, 600) // beat 1
    expect(early).toEqual(sameStep)
    expect(early.pan !== nextStep.pan || early.tilt !== nextStep.tilt).toBe(true)
  })
})

describe('build / strobe / peak effects', () => {
  // generic-rgb-4ch is [dimmer, r, g, b]; channel 1 is the master dimmer.
  const dimAt = (effect: EffectSettings, ms: number): number =>
    renderTick({
      fixtures: [patched('p', 'generic-rgb-4ch', 1)],
      scene: sceneWith(effect),
      beat: beatAt(ms),
      nowMs: ms
    })
      .get(1)!
      .getChannel(1)

  it('eighthStrobe flashes at the top of each 8th note and is dark in the gap', () => {
    // 120 BPM: beat = 500ms, 8th note = 250ms.
    expect(dimAt({ type: 'eighthStrobe' }, 0)).toBeGreaterThan(200)
    expect(dimAt({ type: 'eighthStrobe' }, 150)).toBe(0) // 0.6 into the 8th
  })

  it('eighthBuild lifts its brightness floor deeper into the phrase', () => {
    // Sample the dim tail of an 8th (eighthPhase ~0.96) early vs late; both
    // beats share the same 8th-note phase, so only the phrase ramp differs.
    const early = dimAt({ type: 'eighthBuild' }, 240) // beat 0.48
    const late = dimAt({ type: 'eighthBuild' }, 15240) // beat 30.48, same phase
    expect(late).toBeGreaterThan(early)
  })

  it('rainbowStep holds a hue within a beat and snaps to the next on the beat', () => {
    // generic-rgb-3ch is [r, g, b]; read green to separate red from yellow.
    const green = (ms: number): number =>
      renderTick({
        fixtures: [patched('p', 'generic-rgb-3ch', 1)],
        scene: sceneWith({ type: 'rainbowStep', beats: 1 }),
        beat: beatAt(ms),
        nowMs: ms
      })
        .get(1)!
        .getChannel(2)
    expect(green(100)).toBe(green(400)) // same beat 0 hue
    expect(green(600)).not.toBe(green(100)) // beat 1 hue differs
  })

  it('strike hits full every N beats then fades and re-hits', () => {
    const g = (ms: number): number => dimAt({ type: 'strike', beats: 2 }, ms)
    expect(g(0)).toBeGreaterThan(240) // hit on the strike
    expect(g(760)).toBeLessThan(g(0)) // faded ~0.76 beats later
    expect(g(1000)).toBeGreaterThan(240) // strikes again 2 beats on
  })

  it('randomColor holds a palette color across its step', () => {
    const palette: Rgbw[] = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 255, g: 255, b: 0 }
    ]
    const effect: EffectSettings = { type: 'randomColor', beats: 3, colors: palette }
    const rgb = (ms: number): [number, number, number] => {
      const u = renderTick({
        fixtures: [patched('p', 'generic-rgb-3ch', 1)],
        scene: sceneWith(effect),
        beat: beatAt(ms),
        nowMs: ms
      }).get(1)!
      return [u.getChannel(1), u.getChannel(2), u.getChannel(3)]
    }
    // Step = 3 beats = 1500ms: same step holds, and every pick is in-palette.
    expect(rgb(1000)).toEqual(rgb(500))
    for (const ms of [500, 2000, 3500, 5000]) {
      const [r, g, b] = rgb(ms)
      expect(palette.some((c) => c.r === r && c.g === g && c.b === b)).toBe(true)
    }
  })

  it('strobe drives full brightness even when the scene dimmer is low', () => {
    const fixtures = [patched('p', 'generic-rgb-4ch', 1)]
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [{ group: 'all', color: { r: 255, g: 255, b: 255 }, dimmer: 0.3, effect: { type: 'strobe' } }]
    }
    // nowMs 0 => simulated strobe gate open, so the dimmer channel reads full.
    expect(renderTick({ fixtures, scene, beat: beatAt(0), nowMs: 0 }).get(1)!.getChannel(1)).toBeGreaterThan(240)
  })
})

describe('solo (eerie / sparse)', () => {
  it('lights exactly one cell at a time and switches between steps', () => {
    const fixtures = Array.from({ length: 4 }, (_, i) => patched(`p${i}`, 'generic-rgb-4ch', 1 + i * 4))
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [{ group: 'all', color: { r: 255, g: 255, b: 255 }, dimmer: 1, effect: { type: 'solo', beats: 1 } }]
    }
    const litIndex = (ms: number): number => {
      const u = renderTick({ fixtures, scene, beat: beatAt(ms), nowMs: ms }).get(1)!
      const lit = fixtures.filter((f) => u.getChannel(f.patch.address) > 10)
      expect(lit.length).toBe(1) // exactly one cell at a time
      return fixtures.findIndex((f) => u.getChannel(f.patch.address) > 10)
    }
    const chosen = [20, 520, 1020, 1520, 2020, 2520].map(litIndex)
    expect(new Set(chosen).size).toBeGreaterThan(1) // switches around over steps
  })
})
