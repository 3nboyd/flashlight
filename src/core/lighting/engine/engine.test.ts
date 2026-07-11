import { describe, it, expect } from 'vitest'
import { renderTick } from './LightingEngine'
import { BeatClock } from './BeatClock'
import { builtinFixturesById } from '../fixtures/library'
import type { PatchedFixture } from '../fixtures/types'
import type { Scene } from './types'
import { DEFAULT_OVERRIDES, defaultLightingProject } from './types'
import { PRESET_SCENES } from './presetScenes'

const defs = builtinFixturesById()

function patched(id: string, definitionId: string, universe: number, address: number, group?: string): PatchedFixture {
  return {
    patch: { id, definitionId, label: id, universe, address, group },
    definition: defs.get(definitionId)!
  }
}

function staticScene(color: { r: number; g: number; b: number }, dimmer = 1): Scene {
  return {
    id: 's',
    name: 's',
    uiColor: '#fff',
    targets: [{ group: 'all', color, dimmer }]
  }
}

const beatAt = (ms: number, bpm = 120): ReturnType<BeatClock['positionAt']> => {
  const clock = new BeatClock()
  clock.setBpm(bpm, 0)
  clock.resyncDownbeat(0)
  return clock.positionAt(ms)
}

describe('renderTick - basic rendering', () => {
  it('writes RGB color scaled by dimmer for a 3ch par (no dimmer channel)', () => {
    const fixtures = [patched('p1', 'generic-rgb-3ch', 1, 10)]
    const universes = renderTick({
      fixtures,
      scene: staticScene({ r: 255, g: 100, b: 0 }, 0.5),
      beat: beatAt(0),
      nowMs: 0
    })
    const u = universes.get(1)!
    expect(u.getChannel(10)).toBe(128) // r * 0.5
    expect(u.getChannel(11)).toBe(50) // g * 0.5
    expect(u.getChannel(12)).toBe(0)
  })

  it('uses the hardware dimmer channel at full color for a 4ch par', () => {
    const fixtures = [patched('p1', 'generic-rgb-4ch', 1, 1)]
    const universes = renderTick({
      fixtures,
      scene: staticScene({ r: 200, g: 0, b: 0 }, 0.5),
      beat: beatAt(0),
      nowMs: 0
    })
    const u = universes.get(1)!
    expect(u.getChannel(1)).toBe(128) // dimmer channel carries intensity
    expect(u.getChannel(2)).toBe(200) // color at full
  })

  it('holds static/mode channels at their staticValue', () => {
    const fixtures = [patched('p1', 'generic-rgbw-8ch', 1, 1)]
    const universes = renderTick({
      fixtures,
      scene: staticScene({ r: 255, g: 255, b: 255 }),
      beat: beatAt(0),
      nowMs: 0
    })
    const u = universes.get(1)!
    expect(u.getChannel(7)).toBe(0) // mode
    expect(u.getChannel(8)).toBe(0) // speed
  })

  it('renders dark (not stale) universes when no scene is active', () => {
    const fixtures = [patched('p1', 'generic-rgb-3ch', 1, 1)]
    const universes = renderTick({ fixtures, scene: null, beat: beatAt(0), nowMs: 0 })
    expect(universes.get(1)!.getChannel(1)).toBe(0)
  })

  it('leaves fixtures matching no scene target dark', () => {
    const fixtures = [
      patched('par', 'generic-rgb-3ch', 1, 1, 'pars'),
      patched('mover', 'generic-moving-head-8ch', 1, 100, 'movers')
    ]
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [{ group: 'pars', color: { r: 255, g: 0, b: 0 }, dimmer: 1 }]
    }
    const universes = renderTick({ fixtures, scene, beat: beatAt(0), nowMs: 0 })
    const u = universes.get(1)!
    expect(u.getChannel(1)).toBe(255) // par lit
    expect(u.getChannel(103)).toBe(0) // mover dimmer dark
  })
})

describe('renderTick - live overrides', () => {
  const fixtures = [patched('p1', 'generic-rgb-3ch', 1, 1)]
  const scene = staticScene({ r: 255, g: 255, b: 255 })

  it('blackout zeroes everything regardless of scene', () => {
    const universes = renderTick({
      fixtures,
      scene,
      overrides: { ...DEFAULT_OVERRIDES, blackout: true },
      beat: beatAt(0),
      nowMs: 0
    })
    expect(universes.get(1)!.getChannel(1)).toBe(0)
  })

  it('master dimmer scales output', () => {
    const universes = renderTick({
      fixtures,
      scene,
      overrides: { ...DEFAULT_OVERRIDES, masterDimmer: 0.4 },
      beat: beatAt(0),
      nowMs: 0
    })
    expect(universes.get(1)!.getChannel(1)).toBe(102)
  })

  it('color override replaces the scene color', () => {
    const universes = renderTick({
      fixtures,
      scene,
      overrides: { ...DEFAULT_OVERRIDES, colorOverride: { r: 0, g: 0, b: 255 } },
      beat: beatAt(0),
      nowMs: 0
    })
    const u = universes.get(1)!
    expect(u.getChannel(1)).toBe(0)
    expect(u.getChannel(3)).toBe(255)
  })

  it('momentary strobe on a fixture without a strobe channel gates intensity at ~10Hz', () => {
    const on = renderTick({
      fixtures,
      scene,
      overrides: { ...DEFAULT_OVERRIDES, strobe: true },
      beat: beatAt(0),
      nowMs: 0 // gate open
    })
    const off = renderTick({
      fixtures,
      scene,
      overrides: { ...DEFAULT_OVERRIDES, strobe: true },
      beat: beatAt(50),
      nowMs: 50 // gate closed
    })
    expect(on.get(1)!.getChannel(1)).toBe(255)
    expect(off.get(1)!.getChannel(1)).toBe(0)
  })

  it('momentary strobe on a fixture with a strobe channel drives it into its strobe range', () => {
    const strobeFixture = [patched('s1', 'generic-rgbw-8ch', 1, 1)]
    const universes = renderTick({
      fixtures: strobeFixture,
      scene,
      overrides: { ...DEFAULT_OVERRIDES, strobe: true },
      beat: beatAt(0),
      nowMs: 0
    })
    const value = universes.get(1)!.getChannel(6)
    expect(value).toBeGreaterThanOrEqual(16)
    expect(value).toBeLessThanOrEqual(255)
  })
})

describe('renderTick - beat-locked effects', () => {
  it('beatPulse is bright on the beat and decays into the off-beat', () => {
    const fixtures = [patched('p1', 'generic-rgb-4ch', 1, 1)]
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [{ group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, effect: { type: 'beatPulse' } }]
    }
    const onBeat = renderTick({ fixtures, scene, beat: beatAt(0), nowMs: 0 })
    const offBeat = renderTick({ fixtures, scene, beat: beatAt(400), nowMs: 400 }) // 80% through a 120bpm beat
    expect(onBeat.get(1)!.getChannel(1)).toBe(255)
    expect(offBeat.get(1)!.getChannel(1)).toBeLessThan(100)
  })

  it('chase lights exactly one fixture per beat and advances', () => {
    const fixtures = [
      patched('a', 'generic-rgb-3ch', 1, 1),
      patched('b', 'generic-rgb-3ch', 1, 4),
      patched('c', 'generic-rgb-3ch', 1, 7)
    ]
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [
        { group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, effect: { type: 'chase', beats: 1 } }
      ]
    }
    // 120 BPM: beat 0 at t=0, beat 1 at t=500, beat 2 at t=1000.
    const tick0 = renderTick({ fixtures, scene, beat: beatAt(0), nowMs: 0 })
    const tick1 = renderTick({ fixtures, scene, beat: beatAt(500), nowMs: 500 })

    const litAt = (universes: Map<number, InstanceType<typeof import('../dmx/Universe').Universe>>): number[] =>
      [1, 4, 7].filter((addr) => universes.get(1)!.getChannel(addr) > 0)

    expect(litAt(tick0)).toEqual([1])
    expect(litAt(tick1)).toEqual([4])
  })

  it('colorCycle steps its palette every N beats', () => {
    const fixtures = [patched('p1', 'generic-rgb-3ch', 1, 1)]
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [
        {
          group: 'all',
          color: { r: 255, g: 0, b: 0 },
          dimmer: 1,
          effect: {
            type: 'colorCycle',
            beats: 4,
            colors: [
              { r: 255, g: 0, b: 0 },
              { r: 0, g: 255, b: 0 }
            ]
          }
        }
      ]
    }
    // 120 BPM: 4 beats = 2000ms.
    const first = renderTick({ fixtures, scene, beat: beatAt(0), nowMs: 0 })
    const second = renderTick({ fixtures, scene, beat: beatAt(2100), nowMs: 2100 })
    expect(first.get(1)!.getChannel(1)).toBe(255)
    expect(first.get(1)!.getChannel(2)).toBe(0)
    expect(second.get(1)!.getChannel(1)).toBe(0)
    expect(second.get(1)!.getChannel(2)).toBe(255)
  })

  it('audio-reactive effects follow the supplied features', () => {
    const fixtures = [patched('p1', 'generic-rgb-4ch', 1, 1)]
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [
        { group: 'all', color: { r: 255, g: 255, b: 255 }, dimmer: 1, effect: { type: 'bassPulse' } }
      ]
    }
    const loud = renderTick({
      fixtures,
      scene,
      beat: beatAt(0),
      audio: { rms: 0.8, bass: 0.9, mid: 0.5, high: 0.3, onset: true, timestampMs: 0 },
      nowMs: 0
    })
    const quiet = renderTick({
      fixtures,
      scene,
      beat: beatAt(0),
      audio: { rms: 0.05, bass: 0.02, mid: 0.02, high: 0.01, onset: false, timestampMs: 0 },
      nowMs: 0
    })
    expect(loud.get(1)!.getChannel(1)).toBeGreaterThan(200)
    expect(quiet.get(1)!.getChannel(1)).toBeLessThan(20)
  })

  it('movementCircle drives pan/tilt around the base position', () => {
    const fixtures = [patched('m1', 'generic-moving-head-8ch', 1, 1)]
    const scene: Scene = {
      id: 's',
      name: 's',
      uiColor: '#fff',
      targets: [
        {
          group: 'all',
          color: { r: 255, g: 0, b: 0 },
          dimmer: 1,
          pan: 128,
          tilt: 128,
          effect: { type: 'movementCircle', beats: 4, amplitude: 0.5 }
        }
      ]
    }
    // Collect pan values across a cycle; they should vary around 128.
    const pans: number[] = []
    for (const ms of [0, 500, 1000, 1500]) {
      const universes = renderTick({ fixtures, scene, beat: beatAt(ms), nowMs: ms })
      pans.push(universes.get(1)!.getChannel(1))
    }
    expect(Math.max(...pans)).toBeGreaterThan(150)
    expect(Math.min(...pans)).toBeLessThan(106)
  })
})

describe('preset scenes and project defaults', () => {
  it('all preset scenes render without throwing on a mixed rig', () => {
    const fixtures = [
      patched('par1', 'generic-rgb-3ch', 1, 1),
      patched('par2', 'generic-rgbw-8ch', 1, 10),
      patched('strobe', 'generic-strobe-2ch', 1, 20),
      patched('mover', 'generic-moving-head-11ch', 2, 1),
      patched('laser', 'generic-laser-2ch', 2, 50)
    ]
    for (const scene of PRESET_SCENES) {
      for (const ms of [0, 133, 977, 4200]) {
        const universes = renderTick({
          fixtures,
          scene,
          beat: beatAt(ms, 128),
          audio: { rms: 0.5, bass: 0.6, mid: 0.4, high: 0.3, onset: false, timestampMs: ms },
          nowMs: ms
        })
        expect(universes.size).toBe(2)
      }
    }
  })

  it('default project has a 16-pad grid and sane output config', () => {
    const project = defaultLightingProject()
    expect(project.padSceneIds).toHaveLength(16)
    expect(project.output.protocol).toBe('artnet')
    expect(project.output.fps).toBeGreaterThanOrEqual(30)
  })
})
