import { describe, it, expect } from 'vitest'
import { renderTick } from './LightingEngine'
import { BeatClock } from './BeatClock'
import { builtinFixturesById } from '../fixtures/library'
import type { PatchedFixture } from '../fixtures/types'
import type { Scene } from './types'
import { PRESET_LIBRARY, PRESET_SCENES } from './presetScenes'

const defs = builtinFixturesById()

function patched(id: string, definitionId: string, address: number, group?: string): PatchedFixture {
  return {
    patch: { id, definitionId, label: id, universe: 1, address, group },
    definition: defs.get(definitionId)!
  }
}

const beat = (() => {
  const clock = new BeatClock()
  clock.setBpm(120, 0)
  clock.resyncDownbeat(0)
  return clock.positionAt(0)
})()

describe('kind targeting', () => {
  const rig = [
    patched('par', 'generic-rgb-4ch', 1),
    patched('fog', 'generic-fog-1ch', 10),
    patched('laser', 'generic-laser-2ch', 20)
  ]

  it("kind:fog lights only the fog machine, wherever it's patched", () => {
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [{ group: 'kind:fog', color: { r: 255, g: 255, b: 255 }, dimmer: 1 }]
    }
    const data = renderTick({ fixtures: rig, scene, beat, nowMs: 0 }).get(1)!.toBuffer()
    expect(data[9]).toBe(255) // fog output channel
    expect(data[0]).toBe(0) // par dimmer stays dark
    expect(data[19]).toBe(0) // laser stays off
  })

  it('kind targets layer with all-targets (later target wins for its kind)', () => {
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [
        { group: 'all', color: { r: 0, g: 0, b: 255 }, dimmer: 0.5 },
        { group: 'kind:laser', color: { r: 0, g: 255, b: 0 }, dimmer: 1 }
      ]
    }
    const data = renderTick({ fixtures: rig, scene, beat, nowMs: 0 }).get(1)!.toBuffer()
    expect(data[0]).toBe(128) // par at the all-target's 50%
    expect(data[19]).toBe(255) // laser driven by its kind target
  })

  it('group tags still work alongside kind targets', () => {
    const grouped = [patched('parA', 'generic-rgb-4ch', 1, 'front')]
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [{ group: 'front', color: { r: 255, g: 0, b: 0 }, dimmer: 1 }]
    }
    const data = renderTick({ fixtures: grouped, scene, beat, nowMs: 0 }).get(1)!.toBuffer()
    expect(data[0]).toBe(255)
  })
})

describe('preset library integrity', () => {
  it('has presets across the four buckets with unique ids and a category each', () => {
    expect(PRESET_LIBRARY.length).toBe(4)
    expect(PRESET_LIBRARY.map((c) => c.category)).toEqual(['normal', 'build', 'flash', 'peak'])
    expect(PRESET_SCENES.length).toBeGreaterThanOrEqual(24)
    const ids = new Set(PRESET_SCENES.map((s) => s.id))
    expect(ids.size).toBe(PRESET_SCENES.length)
    expect(PRESET_SCENES.every((s) => s.category !== undefined)).toBe(true)
  })

  it('every preset renders on a full mixed rig without throwing', () => {
    const rig = [
      patched('par1', 'generic-rgb-4ch', 1),
      patched('par2', 'generic-rgbaw-uv-7ch', 10),
      patched('mover', 'generic-moving-head-8ch', 20),
      patched('wave', 'generic-moving-bar-5head-27ch', 30),
      patched('bar', 'generic-pixel-bar-8seg-26ch', 60),
      patched('strobe', 'generic-strobe-2ch', 90),
      patched('laser', 'generic-laser-2ch', 95),
      patched('derby', 'generic-derby-6ch', 100),
      patched('uv', 'generic-uv-2ch', 110),
      patched('fog', 'generic-fog-1ch', 115),
      patched('scanner', 'generic-scanner-6ch', 120)
    ]
    for (const scene of PRESET_SCENES) {
      const universes = renderTick({
        fixtures: rig,
        scene,
        beat,
        audio: { rms: 0.5, bass: 0.6, mid: 0.4, high: 0.3, onset: false, timestampMs: 0 },
        nowMs: 500
      })
      expect(universes.get(1)).toBeDefined()
    }
  })

  it('momentary presets are exactly the burst ones', () => {
    const momentary = PRESET_SCENES.filter((s) => s.momentary).map((s) => s.id)
    expect(momentary.sort()).toEqual(['preset-blinder', 'preset-fog-burst', 'preset-strobe-hit'])
  })

  it('Fog Burst actually drives a fog machine', () => {
    const fogScene = PRESET_SCENES.find((s) => s.id === 'preset-fog-burst')!
    const rig = [patched('fog', 'generic-fog-1ch', 50)]
    const data = renderTick({ fixtures: rig, scene: fogScene, beat, nowMs: 0 }).get(1)!.toBuffer()
    expect(data[49]).toBe(255)
  })
})
