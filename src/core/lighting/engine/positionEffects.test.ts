import { describe, it, expect } from 'vitest'
import { renderTick } from './LightingEngine'
import { BeatClock } from './BeatClock'
import { builtinFixturesById } from '../fixtures/library'
import type { PatchedFixture } from '../fixtures/types'
import type { Scene } from './types'

const defs = builtinFixturesById()

function patched(id: string, definitionId: string, address: number): PatchedFixture {
  return { patch: { id, definitionId, label: id, universe: 1, address }, definition: defs.get(definitionId)! }
}

function beatAt(ms: number): ReturnType<BeatClock['positionAt']> {
  const clock = new BeatClock()
  clock.setBpm(120, 0)
  clock.resyncDownbeat(0)
  return clock.positionAt(ms)
}

// A left strobe, the 10-pixel bar in the middle, a right strobe. One chase
// across group 'all' should walk one lit cell along the physical X axis:
// strobe L -> pixel 1..10 -> strobe R (12 cells total).
const STROBE_L = patched('strobeL', 'rgbw-strobe-panel-11ch', 1) // ch 1..11
const BAR = patched('bar', 'rgbw-beam-bar-10px-43ch', 12) // ch 12..54
const STROBE_R = patched('strobeR', 'rgbw-strobe-panel-11ch', 55) // ch 55..65

const CHASE: Scene = {
  id: 's',
  name: 's',
  uiColor: '#f00',
  targets: [{ group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, effect: { type: 'chase', beats: 1, colors: [{ r: 255, g: 0, b: 0 }] } }]
}

const POSITIONS = new Map([
  ['strobeL', 0.1],
  ['bar', 0.5],
  ['strobeR', 0.9]
])

// 120 BPM: one beat = 500ms. Sample just past the beat to avoid float edges.
function render(fixtures: PatchedFixture[], beat: number): ReturnType<typeof renderTick> {
  const ms = beat * 500 + 20
  return renderTick({ fixtures, scene: CHASE, positions: POSITIONS, beat: beatAt(ms), nowMs: ms })
}

const strobeLit = (u: ReturnType<typeof renderTick>, addr: number): number => u.get(1)!.getChannel(addr) // dimmer channel
const barPixelRed = (u: ReturnType<typeof renderTick>, pixel: number): number => u.get(1)!.getChannel(12 + 2 + (pixel - 1) * 4)

describe('position-aware sweep across a strobe / bar / strobe rig', () => {
  const rig = [STROBE_L, BAR, STROBE_R]

  it('lights the LEFT strobe first, then walks into the bar', () => {
    const u0 = render(rig, 0)
    expect(strobeLit(u0, 1)).toBe(255) // left strobe on
    expect(strobeLit(u0, 55)).toBe(0) // right strobe off
    expect(Math.max(...Array.from({ length: 10 }, (_, i) => barPixelRed(u0, i + 1)))).toBe(0) // bar dark
  })

  it('walks pixel by pixel through the bar in the middle of the sweep', () => {
    const u3 = render(rig, 3) // cell rank 3 = bar pixel 3
    expect(barPixelRed(u3, 3)).toBe(255)
    expect(barPixelRed(u3, 2)).toBe(0)
    expect(barPixelRed(u3, 4)).toBe(0)
    expect(strobeLit(u3, 1)).toBe(0)
    expect(strobeLit(u3, 55)).toBe(0)
  })

  it('reaches the RIGHT strobe at the end of the axis', () => {
    const u11 = render(rig, 11) // cell rank 11 = right strobe
    expect(strobeLit(u11, 55)).toBe(255)
    expect(strobeLit(u11, 1)).toBe(0)
    expect(Math.max(...Array.from({ length: 10 }, (_, i) => barPixelRed(u11, i + 1)))).toBe(0)
  })

  it('follows stage X, not patch order (scrambled patches still sweep L to R)', () => {
    // Patched right-to-left on purpose; positions still put the left strobe first.
    const scrambled = [STROBE_R, BAR, STROBE_L]
    const u0 = render(scrambled, 0)
    expect(strobeLit(u0, 1)).toBe(255) // left strobe (by X) lights first
    expect(strobeLit(u0, 55)).toBe(0)
  })
})
