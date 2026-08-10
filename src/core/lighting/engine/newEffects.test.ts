import { describe, it, expect } from 'vitest'
import { renderTick } from './LightingEngine'
import { BeatClock } from './BeatClock'
import { builtinFixturesById } from '../fixtures/library'
import type { PatchedFixture } from '../fixtures/types'
import type { Scene, EffectSettings, Rgbw } from './types'
import type { AudioFeatures } from '../audio/features'
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

describe('tapPulse', () => {
  const scene = (colors: Rgbw[]): Scene => ({
    id: 's',
    name: 's',
    uiColor: '#fff',
    targets: [{ group: 'all', color: { r: 255, g: 0, b: 90 }, dimmer: 1, effect: { type: 'tapPulse', colors } }]
  })

  it('is fully dark with no tap and full brightness on a fresh tap', () => {
    const fixtures = [patched('p', 'generic-rgb-4ch', 1)] // ch1 = dimmer
    const colors: Rgbw[] = [{ r: 255, g: 0, b: 0 }]
    const dark = renderTick({ fixtures, scene: scene(colors), tap: { env: 0, index: 0 }, beat: beatAt(0), nowMs: 0 }).get(1)!
    expect(dark.getChannel(1)).toBe(0) // blackout base
    const flash = renderTick({ fixtures, scene: scene(colors), tap: { env: 1, index: 0 }, beat: beatAt(0), nowMs: 0 }).get(1)!
    expect(flash.getChannel(1)).toBeGreaterThan(240) // full on the tap
  })

  it('fires the white LED alongside the color on a tap', () => {
    // rgbw-strobe-panel-11ch: ch1 dimmer, ch2 R, ch3 G, ch4 B, ch5 W.
    const fixtures = [patched('p', 'rgbw-strobe-panel-11ch', 1)]
    const flash = renderTick({
      fixtures,
      scene: scene([{ r: 0, g: 0, b: 255 }]),
      tap: { env: 1, index: 0 },
      beat: beatAt(0),
      nowMs: 0
    }).get(1)!
    expect(flash.getChannel(4)).toBeGreaterThan(240) // blue color LED
    expect(flash.getChannel(5)).toBeGreaterThan(200) // white LED (strobe) fires too
  })

  it('cycles the flash color with the tap index', () => {
    // RGBW panel (ch2 R, ch3 G) keeps color separate from the white LED, so
    // the cycling color stays visible under the white strobe.
    const fixtures = [patched('p', 'rgbw-strobe-panel-11ch', 1)]
    const colors: Rgbw[] = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 }
    ]
    const t0 = renderTick({ fixtures, scene: scene(colors), tap: { env: 1, index: 0 }, beat: beatAt(0), nowMs: 0 }).get(1)!
    const t1 = renderTick({ fixtures, scene: scene(colors), tap: { env: 1, index: 1 }, beat: beatAt(0), nowMs: 0 }).get(1)!
    expect(t0.getChannel(2)).toBeGreaterThan(t0.getChannel(3)) // index 0 = red
    expect(t1.getChannel(3)).toBeGreaterThan(t1.getChannel(2)) // index 1 = green
  })
})

describe('rainbowStrobe (Rainbow Peak panel)', () => {
  // rgb-white-panel-165ch: ch1..135 = 45 RGB pixels, ch136..165 = 30 white LEDs.
  const fixtures = [patched('p', 'rgb-white-panel-165ch', 1)]
  const scene = sceneWith({ type: 'rainbowStrobe', beats: 1 })
  const maxRgb = (u: ReturnType<ReturnType<typeof renderTick>['get']>): number => {
    let m = 0
    for (let c = 1; c <= 135; c++) m = Math.max(m, u!.getChannel(c))
    return m
  }

  it('pops the white LEDs on the beat and keeps them off between beats', () => {
    // 120bpm -> 500ms/beat: 0ms is on the beat, 250ms is mid-beat.
    const onBeat = renderTick({ fixtures, scene, beat: beatAt(0), nowMs: 0 }).get(1)!
    const offBeat = renderTick({ fixtures, scene, beat: beatAt(250), nowMs: 250 }).get(1)!
    expect(onBeat.getChannel(136)).toBeGreaterThan(200) // white LED flashes on the beat
    expect(offBeat.getChannel(136)).toBe(0) // ...and only on the beat
  })

  it('keeps the color pixels lit through the whole beat (only pulsing, never dark)', () => {
    const onBeat = renderTick({ fixtures, scene, beat: beatAt(0), nowMs: 0 }).get(1)!
    const offBeat = renderTick({ fixtures, scene, beat: beatAt(250), nowMs: 250 }).get(1)!
    expect(maxRgb(onBeat)).toBeGreaterThan(200)
    expect(maxRgb(offBeat)).toBeGreaterThan(100) // dimmed by the pulse but still colorful
  })

  it('flashes the white LEDs on the configurable subdivision', () => {
    const white = (flashBeats: number, ms: number): number =>
      renderTick({ fixtures, scene: sceneWith({ type: 'rainbowStrobe', beats: 1, flashBeats }), beat: beatAt(ms), nowMs: ms })
        .get(1)!
        .getChannel(136)
    // Every 4 beats: pops on beat 0, dark on beat 1 (500ms at 120bpm).
    expect(white(4, 0)).toBeGreaterThan(200)
    expect(white(4, 500)).toBe(0)
    // Eighth note: pops on beat 0 AND beat 0.5 (250ms).
    expect(white(0.5, 0)).toBeGreaterThan(200)
    expect(white(0.5, 250)).toBeGreaterThan(200)
  })
})

describe('sweep (side to side, position-ordered)', () => {
  it('lights the left end first, then the right end as the head travels', () => {
    const fixtures = [
      patched('a', 'generic-rgb-4ch', 1),
      patched('b', 'generic-rgb-4ch', 5),
      patched('c', 'generic-rgb-4ch', 9)
    ]
    const positions = new Map([
      ['a', 0],
      ['b', 0.5],
      ['c', 1]
    ])
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [{ group: 'all', color: { r: 255, g: 255, b: 255 }, dimmer: 1, effect: { type: 'sweep', beats: 4 } }]
    }
    const dim = (ms: number, addr: number): number =>
      renderTick({ fixtures, scene, positions, beat: beatAt(ms), nowMs: ms }).get(1)!.getChannel(addr)
    // beat ~0: head at the left -> a lit, c dark.
    expect(dim(20, 1)).toBeGreaterThan(dim(20, 9))
    // beat ~4 (head swept to the right) -> c lit, a dark.
    expect(dim(1980, 9)).toBeGreaterThan(dim(1980, 1))
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

  it('lights a band ~a third of a larger group, not a single cell', () => {
    const fixtures = Array.from({ length: 9 }, (_, i) => patched(`p${i}`, 'generic-rgb-4ch', 1 + i * 4))
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [{ group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, effect: { type: 'solo', beats: 4, size: 0.34 } }]
    }
    const u = renderTick({ fixtures, scene, beat: beatAt(0), nowMs: 0 }).get(1)!
    const lit = fixtures.filter((f) => u.getChannel(f.patch.address) > 0).length
    expect(lit).toBe(3) // round(9 * 0.34) = 3 contiguous cells, not one
  })
})

describe('drift (roaming soft glow)', () => {
  const fixtures = Array.from({ length: 11 }, (_, i) => patched(`p${i}`, 'generic-rgb-4ch', 1 + i * 4))
  const positions = new Map(fixtures.map((f, i) => [f.patch.id, i / 10]))
  const scene: Scene = {
    id: 's',
    name: 's',
    uiColor: '#fff',
    targets: [{ group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, effect: { type: 'drift', beats: 8, size: 0.4 } }]
  }
  const levels = (ms: number): number[] =>
    fixtures.map((f) => renderTick({ fixtures, scene, positions, beat: beatAt(ms), nowMs: ms }).get(1)!.getChannel(f.patch.address))

  it('is a soft gradient (a peak fading to nothing), not a hard on/off', () => {
    const l = levels(1000)
    const max = Math.max(...l)
    expect(max).toBeGreaterThan(0)
    expect(l.some((v) => v > 5 && v < max * 0.9)).toBe(true) // a partial-brightness falloff cell
    expect(l.some((v) => v === 0)).toBe(true) // and cells fully faded out
  })

  it('drifts: the brightest cell wanders over time', () => {
    const brightest = (ms: number): number => {
      const l = levels(ms)
      return l.indexOf(Math.max(...l))
    }
    const idxs = [0, 2000, 4000, 6000, 8000, 10000].map(brightest)
    expect(new Set(idxs).size).toBeGreaterThan(1)
  })
})

describe('home / park position', () => {
  // rgbw-beam-bar-10px-43ch: ch1 = tilt.
  const bar = (limits: { homeTilt?: number }): PatchedFixture => {
    const p = patched('bar', 'rgbw-beam-bar-10px-43ch', 1)
    return { ...p, patch: { ...p.patch, limits } }
  }
  const barScene = (effect: EffectSettings, extras: Partial<Scene['targets'][0]> = {}): Scene => ({
    id: 's',
    name: 's',
    uiColor: '#fff',
    targets: [{ group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, effect, ...extras }]
  })

  it('parks tilt at home when a still scene leaves position unset', () => {
    const u = renderTick({ fixtures: [bar({ homeTilt: 200 })], scene: barScene({ type: 'beatPulse' }), beat: beatAt(0), nowMs: 0 }).get(1)!
    expect(u.getChannel(1)).toBe(200)
  })

  it('lets a movement effect drive tilt instead of parking home', () => {
    const fixtures = [bar({ homeTilt: 200 })]
    const scene = barScene({ type: 'movementNod', amplitude: 1 })
    const tilts = [0, 250, 500, 750].map((ms) => renderTick({ fixtures, scene, beat: beatAt(ms), nowMs: ms }).get(1)!.getChannel(1))
    expect(tilts.some((t) => t !== 200)).toBe(true)
  })

  it('honors an explicit scene tilt over the home position', () => {
    const u = renderTick({
      fixtures: [bar({ homeTilt: 200 })],
      scene: barScene({ type: 'beatPulse' }, { tilt: 60 }),
      beat: beatAt(0),
      nowMs: 0
    }).get(1)!
    expect(u.getChannel(1)).toBe(60)
  })
})

describe('adaptive song-arc effects', () => {
  // rgbw-strobe-panel-11ch: ch1 dimmer, ch2 red, ch5 white.
  const panelScene = (type: EffectSettings['type']): Scene => ({
    id: 's',
    name: 's',
    uiColor: '#fff',
    targets: [{ group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, effect: { type } }]
  })
  const fixtures = [patched('p', 'rgbw-strobe-panel-11ch', 1)]
  const aud = (over: Partial<AudioFeatures>): AudioFeatures => ({
    rms: 0,
    bass: 0,
    mid: 0,
    high: 0,
    onset: false,
    timestampMs: 0,
    ...over
  })

  it('is dark when nothing is playing', () => {
    const u = renderTick({
      fixtures,
      scene: panelScene('songRed'),
      song: { phase: 'steady', buildProgress: 0, kick: 0, level: 0 },
      audio: aud({}),
      beat: beatAt(0),
      nowMs: 0
    }).get(1)!
    expect(u.getChannel(1)).toBe(0) // no light at all
  })

  it('pops white + color on the beat once the kick drives', () => {
    const u = renderTick({
      fixtures,
      scene: panelScene('songRed'),
      song: { phase: 'steady', buildProgress: 0, kick: 0.9, level: 0.9 },
      audio: aud({ bass: 0.9 }),
      beat: beatAt(0),
      nowMs: 0
    }).get(1)!
    expect(u.getChannel(5)).toBeGreaterThan(200) // white LED pops on the beat
    expect(u.getChannel(2)).toBeGreaterThan(100) // the color flashes too
  })

  it('runs a moving pixel flow over a melody (no kick): not uniform, not dark', () => {
    const bar = [patched('b', 'rgbw-beam-bar-10px-43ch', 1)] // 10 RGBW pixels, first R at ch3
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [{ group: 'all', color: { r: 0, g: 200, b: 80 }, dimmer: 1, effect: { type: 'songRainbow' } }]
    }
    const u = renderTick({
      fixtures: bar,
      scene,
      song: { phase: 'steady', buildProgress: 0, kick: 0, level: 0.35 },
      audio: aud({ rms: 0.35, high: 0.3 }),
      beat: beatAt(500),
      nowMs: 500
    }).get(1)!
    const pixels = Array.from({ length: 10 }, (_, p) => {
      const r = u.getChannel(3 + p * 4)
      const g = u.getChannel(4 + p * 4)
      const b = u.getChannel(5 + p * 4)
      return Math.max(r, g, b)
    })
    expect(Math.max(...pixels)).toBeGreaterThan(60) // some pixels lit
    expect(Math.min(...pixels)).toBeLessThan(Math.max(...pixels) * 0.5) // a moving bright region, not uniform
  })
})

describe('jerseyClub (tempo-locked kick bounce)', () => {
  const fixtures = [patched('p', 'generic-rgb-4ch', 1)] // ch1 dimmer
  const colors: Rgbw[] = [
    { r: 0, g: 80, b: 255 },
    { r: 0, g: 230, b: 120 },
    { r: 150, g: 0, b: 255 }
  ]
  const scene: Scene = {
    id: 's',
    name: 's',
    uiColor: '#fff',
    targets: [{ group: 'all', color: colors[0], dimmer: 1, effect: { type: 'jerseyClub', colors } }]
  }
  // 120bpm -> 500ms/beat, 125ms/sixteenth. Kicks at 16th 0,3,6,10,12.
  const level = (ms: number): number => renderTick({ fixtures, scene, beat: beatAt(ms), nowMs: ms }).get(1)!.getChannel(1)

  it('flashes on the kicks and stays near-black between them', () => {
    expect(level(0)).toBeGreaterThan(240) // kick at 16th 0
    expect(level(3 * 125)).toBeGreaterThan(240) // kick at 16th 3
    expect(level(8 * 125)).toBeLessThan(40) // 16th 8 is a gap -> near black
  })

  it('cycles a different color on consecutive kicks', () => {
    // ch2=R, ch3=G, ch4=B. Kick0 = blue (B), kick1 (16th 3) = green (G).
    const k0 = renderTick({ fixtures, scene, beat: beatAt(0), nowMs: 0 }).get(1)!
    const k1 = renderTick({ fixtures, scene, beat: beatAt(3 * 125), nowMs: 3 * 125 }).get(1)!
    expect(k0.getChannel(4)).toBeGreaterThan(k0.getChannel(3)) // kick 0: blue > green
    expect(k1.getChannel(3)).toBeGreaterThan(k1.getChannel(4)) // kick 1: green > blue
  })
})

describe('melodyBeat (Live Pulse, silence-aware)', () => {
  // rgbw-strobe-panel-11ch: ch1 dimmer, ch2 red, ch3 green, ch5 white.
  const fixtures = [patched('p', 'rgbw-strobe-panel-11ch', 1)]
  const scene: Scene = {
    id: 's',
    name: 's',
    uiColor: '#fff',
    targets: [{ group: 'all', color: { r: 0, g: 200, b: 80 }, dimmer: 1, effect: { type: 'melodyBeat', amplitude: 0.5 } }]
  }
  const audio = (over: Partial<AudioFeatures>): AudioFeatures => ({
    rms: 0,
    bass: 0,
    mid: 0,
    high: 0,
    onset: false,
    timestampMs: 0,
    ...over
  })

  it('is black in silence and flashes on a melodic hit when no kick is present', () => {
    const song = { phase: 'steady' as const, buildProgress: 0, kick: 0 }
    const silent = renderTick({ fixtures, scene, song, audio: audio({}), beat: beatAt(300), nowMs: 300 }).get(1)!
    const hit = renderTick({ fixtures, scene, song, audio: audio({ high: 0.9, rms: 0.6 }), beat: beatAt(300), nowMs: 300 }).get(1)!
    expect(silent.getChannel(1)).toBe(0) // pitch black when quiet
    expect(hit.getChannel(1)).toBeGreaterThan(0) // quick flash on the melodic hit
    expect(hit.getChannel(5)).toBe(0) // no white strobe in the melodic/quiet mode
  })

  it('runs a quarter-note white + shifting-color beat once the kick drives', () => {
    const song = { phase: 'steady' as const, buildProgress: 0, kick: 0.9 }
    const onBeat = renderTick({ fixtures, scene, song, audio: audio({ bass: 0.9 }), beat: beatAt(0), nowMs: 0 }).get(1)!
    const between = renderTick({ fixtures, scene, song, audio: audio({ bass: 0.9 }), beat: beatAt(250), nowMs: 250 }).get(1)!
    expect(onBeat.getChannel(5)).toBeGreaterThan(200) // white LEDs pop on the beat
    expect(between.getChannel(5)).toBe(0) // white only pops on the beat
    expect(onBeat.getChannel(3)).toBeGreaterThan(onBeat.getChannel(2)) // emerald: green over red
  })
})
