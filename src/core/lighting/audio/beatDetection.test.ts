import { describe, it, expect } from 'vitest'
import { SpectralFluxOnsetDetector, BpmEstimator } from './BeatDetector'
import { BeatClock } from '../engine/BeatClock'

/** Builds a synthetic spectrum frame: quiet noise floor, optional "kick" burst. */
function frame(kick: boolean): Float32Array {
  const spectrum = new Float32Array(64)
  for (let i = 0; i < spectrum.length; i++) {
    spectrum[i] = 0.02
  }
  if (kick) {
    for (let i = 0; i < 8; i++) spectrum[i] = 0.9 // bass-heavy transient
  }
  return spectrum
}

describe('SpectralFluxOnsetDetector', () => {
  it('detects kicks against a steady noise floor and respects the refractory period', () => {
    const detector = new SpectralFluxOnsetDetector()
    const onsets: number[] = []

    // 4 seconds at ~43fps with a kick every 20 frames (~129 BPM).
    for (let i = 0; i < 172; i++) {
      const isKickFrame = i % 20 === 0 && i > 0
      const result = detector.process(frame(isKickFrame))
      if (result.isOnset) onsets.push(i)
    }

    expect(onsets.length).toBeGreaterThanOrEqual(6)
    // Every detected onset should be at (or immediately after) a kick frame.
    for (const at of onsets) {
      expect(at % 20).toBeLessThanOrEqual(1)
    }
  })

  it('does not fire onsets on silence', () => {
    const detector = new SpectralFluxOnsetDetector()
    let onsetCount = 0
    for (let i = 0; i < 100; i++) {
      if (detector.process(frame(false)).isOnset) onsetCount++
    }
    expect(onsetCount).toBe(0)
  })
})

describe('BpmEstimator', () => {
  it('recovers the tempo of a synthetic kick pattern', () => {
    const fps = 43
    const estimator = new BpmEstimator(fps)
    // Kick every 20 frames → period 20/43 s → 129 BPM.
    for (let i = 0; i < fps * 8; i++) {
      estimator.addFrame(i % 20 === 0 ? 5 : 0.1)
    }
    const bpm = estimator.estimate()
    expect(bpm).not.toBeNull()
    expect(bpm!).toBeGreaterThan(123)
    expect(bpm!).toBeLessThan(135)
  })

  it('returns null with insufficient history or flat signal', () => {
    const estimator = new BpmEstimator(43)
    expect(estimator.estimate()).toBeNull()
    for (let i = 0; i < 43 * 8; i++) estimator.addFrame(1)
    expect(estimator.estimate()).toBeNull()
  })
})

describe('BeatClock', () => {
  it('tap tempo derives BPM from tap spacing and anchors phase to the last tap', () => {
    const clock = new BeatClock()
    // Taps every 500ms → 120 BPM.
    for (const t of [0, 500, 1000, 1500, 2000]) clock.tap(t)
    expect(clock.getBpm()).toBeCloseTo(120, 0)
    const pos = clock.positionAt(2000)
    expect(pos.beatPhase).toBeCloseTo(0, 3)
    expect(clock.positionAt(2250).beatPhase).toBeCloseTo(0.5, 2)
  })

  it('phrase/bar phases advance correctly at a known BPM', () => {
    const clock = new BeatClock()
    clock.setBpm(120, 0)
    clock.resyncDownbeat(0)
    // At 120 BPM: 1 beat = 500ms, 1 bar = 2s, 1 phrase (8 bars) = 16s.
    const pos = clock.positionAt(4000) // 8 beats = 2 bars
    expect(pos.barIndex).toBe(2)
    expect(pos.barPhase).toBeCloseTo(0, 3)
    expect(pos.phrasePhase).toBeCloseTo(2 / 8, 3)
  })

  it('setBpm preserves the current beat phase (no visual jump on tempo nudge)', () => {
    const clock = new BeatClock()
    clock.setBpm(120, 0)
    clock.resyncDownbeat(0)
    const before = clock.positionAt(1250).beatPhase // 0.5 at 120 BPM
    clock.setBpm(128, 1250)
    const after = clock.positionAt(1250).beatPhase
    expect(after).toBeCloseTo(before, 3)
  })

  it('nudgeTowardOnset moves the anchor only fractionally', () => {
    const clock = new BeatClock()
    clock.setBpm(120, 0)
    clock.resyncDownbeat(0)
    // An onset 100ms late relative to the grid...
    clock.nudgeTowardOnset(2100, 0.15)
    // ...should shift phase at t=4000 slightly, not by the full 100ms.
    const phase = clock.positionAt(4000).beatPhase
    expect(phase).toBeGreaterThan(0.9) // pulled slightly earlier than a perfect 0
    expect(phase).toBeLessThan(1)
  })

  it('rejects absurd tap-derived tempos', () => {
    const clock = new BeatClock()
    clock.setBpm(128, 0)
    clock.tap(0)
    clock.tap(10) // 6000 BPM — ignored
    expect(clock.getBpm()).toBe(128)
  })
})
