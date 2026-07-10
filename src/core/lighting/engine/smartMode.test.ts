import { describe, it, expect } from 'vitest'
import { SmartModeEngine, type SmartConfig, type SmartDecision } from './SmartMode'
import { BeatClock } from './BeatClock'
import type { AudioFeatures } from '../audio/features'

/**
 * Drives the engine with synthetic "track structures" at 40fps and checks
 * the phase machine reacts like a VJ would: rotate while steady, ramp on
 * builds, slam a peak scene on the drop, chill out on breakdowns.
 */

const FPS = 40

const CONFIG: SmartConfig = {
  pools: {
    chill: ['chill-1', 'chill-2'],
    main: ['main-1', 'main-2', 'main-3'],
    peak: ['peak-1', 'peak-2']
  },
  phrasesPerScene: 1,
  sensitivity: 0.5
}

function feat(bass: number, rms: number, high: number): AudioFeatures {
  return { bass, rms, high, mid: rms, onset: false, timestampMs: 0 }
}

class Runner {
  readonly engine = new SmartModeEngine(FPS)
  readonly clock = new BeatClock()
  readonly decisions: SmartDecision[] = []
  private frame = 0

  constructor() {
    this.engine.updateConfig(CONFIG)
    this.clock.setBpm(128, 0)
    this.clock.resyncDownbeat(0)
  }

  /** Feed `seconds` of identical features; returns all decisions made. */
  run(seconds: number, features: AudioFeatures): SmartDecision[] {
    const out: SmartDecision[] = []
    const frames = Math.round(seconds * FPS)
    for (let i = 0; i < frames; i++) {
      this.frame += 1
      const nowMs = (this.frame * 1000) / FPS
      const decision = this.engine.addFrame(features, this.clock.positionAt(nowMs))
      out.push(decision)
      this.decisions.push(decision)
    }
    return out
  }

  /** Linear ramp of energy over `seconds`. */
  ramp(seconds: number, from: number, to: number, high: number): SmartDecision[] {
    const out: SmartDecision[] = []
    const frames = Math.round(seconds * FPS)
    for (let i = 0; i < frames; i++) {
      this.frame += 1
      const t = i / frames
      const level = from + (to - from) * t
      const nowMs = (this.frame * 1000) / FPS
      const decision = this.engine.addFrame(feat(level, level, high * (0.5 + t)), this.clock.positionAt(nowMs))
      out.push(decision)
      this.decisions.push(decision)
    }
    return out
  }

  sceneChanges(): string[] {
    return this.decisions.map((d) => d.sceneId).filter((s): s is string => s !== null)
  }
}

describe('SmartModeEngine', () => {
  it('stays steady on flat energy and rotates the main pool on phrase boundaries', () => {
    const runner = new Runner()
    // 1 phrase at 128bpm = 8 bars = 32 beats = 15s. Run 50s ≈ 3+ phrases.
    const decisions = runner.run(50, feat(0.55, 0.5, 0.3))
    expect(decisions.every((d) => d.phase === 'steady')).toBe(true)
    const changes = runner.sceneChanges()
    expect(changes.length).toBeGreaterThanOrEqual(2)
    expect(changes.every((s) => s.startsWith('main-'))).toBe(true)
  })

  it('detects a build-up on sustained rising energy and ramps intensity', () => {
    const runner = new Runner()
    runner.run(10, feat(0.45, 0.4, 0.25)) // settle baseline
    const build = runner.ramp(8, 0.45, 0.85, 0.6)
    const buildFrames = build.filter((d) => d.phase === 'build')
    expect(buildFrames.length).toBeGreaterThan(FPS) // in build for >1s
    const first = buildFrames[0]
    const last = buildFrames[buildFrames.length - 1]
    expect(last.buildProgress).toBeGreaterThan(first.buildProgress)
    expect(last.intensity).toBeGreaterThanOrEqual(first.intensity)
  })

  it('fires a peak scene at full intensity when the bass drops after a build', () => {
    const runner = new Runner()
    runner.run(10, feat(0.45, 0.4, 0.25))
    runner.ramp(8, 0.45, 0.8, 0.6)
    const dropFrames = runner.run(1, feat(0.98, 0.9, 0.7))
    const dropDecision = dropFrames.find((d) => d.phase === 'drop' && d.sceneId !== null)
    expect(dropDecision).toBeDefined()
    expect(dropDecision!.sceneId).toMatch(/^peak-/)
    expect(dropDecision!.intensity).toBe(1)
  })

  it('returns to steady after riding the drop for a phrase', () => {
    const runner = new Runner()
    runner.run(10, feat(0.45, 0.4, 0.25))
    runner.ramp(8, 0.45, 0.8, 0.6)
    runner.run(1, feat(0.98, 0.9, 0.7)) // drop hits
    const after = runner.run(20, feat(0.7, 0.65, 0.4)) // sustained banger
    expect(after.some((d) => d.phase === 'steady')).toBe(true)
  })

  it('falls to a chill scene on an energy collapse, then recovers', () => {
    const runner = new Runner()
    runner.run(20, feat(0.6, 0.55, 0.35)) // establish baseline
    const collapse = runner.run(4, feat(0.06, 0.1, 0.1))
    const breakDecision = collapse.find((d) => d.phase === 'break' && d.sceneId !== null)
    expect(breakDecision).toBeDefined()
    expect(breakDecision!.sceneId).toMatch(/^chill-/)
    expect(breakDecision!.intensity).toBeLessThan(1)

    // Energy returns gently → steady with a main scene.
    const recovery = runner.run(6, feat(0.55, 0.5, 0.3))
    const back = recovery.find((d) => d.phase === 'steady' && d.sceneId !== null)
    expect(back).toBeDefined()
    expect(back!.sceneId).toMatch(/^main-/)
  })

  it('does not double-fire drops within the cooldown window', () => {
    const runner = new Runner()
    runner.run(10, feat(0.45, 0.4, 0.25))
    runner.ramp(8, 0.45, 0.8, 0.6)
    runner.run(1, feat(0.98, 0.9, 0.7))
    runner.run(3, feat(0.75, 0.7, 0.4))
    // A second bass spike right away must NOT produce another peak switch.
    const secondSpike = runner.run(1, feat(0.99, 0.95, 0.7))
    expect(secondSpike.every((d) => d.sceneId === null || !d.sceneId.startsWith('peak-'))).toBe(true)
  })

  it('empty pools never emit scene switches but phases still track', () => {
    const runner = new Runner()
    runner.engine.updateConfig({ ...CONFIG, pools: { chill: [], main: [], peak: [] } })
    runner.run(10, feat(0.45, 0.4, 0.25))
    runner.ramp(8, 0.45, 0.85, 0.6)
    runner.run(1, feat(0.98, 0.9, 0.7))
    expect(runner.sceneChanges()).toEqual([])
    expect(runner.decisions.some((d) => d.phase === 'build' || d.phase === 'drop')).toBe(true)
  })
})
