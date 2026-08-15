import { describe, it, expect } from 'vitest'
import { MusicPulse } from './MusicPulse'
import { BeatClock } from './BeatClock'
import type { AudioFeatures } from '../audio/features'

const FPS = 40
const frame = (over: Partial<AudioFeatures>): AudioFeatures => ({
  rms: 0,
  bass: 0,
  mid: 0,
  high: 0,
  onset: false,
  timestampMs: 0,
  ...over
})

function clockAt(bpm: number): BeatClock {
  const c = new BeatClock()
  c.setBpm(bpm, 0)
  c.resyncDownbeat(0)
  return c
}

/** Feed `seconds` of audio at 40fps; `sampler(ms)` returns each frame's features. */
function run(pulse: MusicPulse, clock: BeatClock, seconds: number, sampler: (ms: number) => AudioFeatures): number {
  let kick = 0
  const frames = Math.round(seconds * FPS)
  for (let i = 0; i < frames; i++) {
    const ms = (i / FPS) * 1000
    kick = pulse.addFrame(sampler(ms), clock.positionAt(ms)).kick
  }
  return kick
}

describe('MusicPulse kick detection', () => {
  it('rises for a consistent on-grid quarter-note kick drum', () => {
    const pulse = new MusicPulse(FPS)
    const clock = clockAt(120) // 500ms per beat
    const kick = run(pulse, clock, 3, (ms) => {
      // A short punchy bass hit at the top of each beat, quiet between.
      const intoBeat = ms % 500
      const hit = intoBeat < 60 ? 0.9 : 0.02
      return frame({ bass: hit, rms: hit })
    })
    expect(kick).toBeGreaterThan(0.6)
  })

  it('stays low for a sustained bass note (energy but no transients)', () => {
    const pulse = new MusicPulse(FPS)
    const clock = clockAt(120)
    const kick = run(pulse, clock, 3, () => frame({ bass: 0.7, rms: 0.5 }))
    expect(kick).toBeLessThan(0.3)
  })

  it('stays low for a low melody whose hits land off the beat grid', () => {
    const pulse = new MusicPulse(FPS)
    const clock = clockAt(120)
    const kick = run(pulse, clock, 3, (ms) => {
      // Punchy low hits, but syncopated (halfway between beats) - not a kick.
      const intoBeat = ms % 500
      const hit = intoBeat > 250 && intoBeat < 310 ? 0.9 : 0.02
      return frame({ bass: hit, rms: hit })
    })
    expect(kick).toBeLessThan(0.4)
  })

  it('fast envelope drops on a cut and snaps back on cut-in, faster than level', () => {
    const pulse = new MusicPulse(FPS)
    const clock = clockAt(120)
    let s = pulse.addFrame(frame({ rms: 0.6 }), clock.positionAt(0))
    for (let i = 1; i < 6; i++) s = pulse.addFrame(frame({ rms: 0.6 }), clock.positionAt(i * 25))
    expect(s.fast).toBeGreaterThan(0.4)
    // Cut the sound for ~90ms (a scratch): fast should collapse well below level.
    for (let i = 0; i < 4; i++) s = pulse.addFrame(frame({}), clock.positionAt(150 + i * 25))
    expect(s.fast).toBeLessThan(0.15)
    expect(s.fast).toBeLessThan(s.level) // fast reacts quicker than the slow level
    // Cut back in: one loud frame snaps fast straight back up.
    s = pulse.addFrame(frame({ rms: 0.6 }), clock.positionAt(260))
    expect(s.fast).toBeGreaterThan(0.5)
  })

  it('surge fires on a big hit out of quiet, but not during steady loud music', () => {
    const pulse = new MusicPulse(FPS)
    const clock = clockAt(120)
    // Quiet for ~0.5s, then a sudden loud hit.
    let s = pulse.addFrame(frame({ rms: 0.02 }), clock.positionAt(0))
    for (let i = 1; i < 20; i++) s = pulse.addFrame(frame({ rms: 0.02 }), clock.positionAt(i * 25))
    s = pulse.addFrame(frame({ rms: 0.85, bass: 0.8 }), clock.positionAt(500))
    expect(s.surge).toBeGreaterThan(0.7) // silence -> boom marks a peak

    // Hold loud and steady for ~1s: the baseline catches up, no new surges.
    let maxLater = 0
    for (let i = 0; i < 40; i++) {
      s = pulse.addFrame(frame({ rms: 0.8, bass: 0.75 }), clock.positionAt(525 + i * 25))
      if (i > 12) maxLater = Math.max(maxLater, s.surge) // after the first flash decays
    }
    expect(maxLater).toBeLessThan(0.2) // steady loud does not keep strobing
  })

  it('holds the section through a steady groove and advances on a sustained texture change', () => {
    const pulse = new MusicPulse(FPS)
    const clock = clockAt(120)
    const groove = (ms: number, extra: Partial<AudioFeatures> = {}): AudioFeatures => {
      const bass = ms % 500 < 60 ? 0.6 : 0.35 // kick blip each beat
      return frame({ rms: 0.4, bass, mid: 0.3, high: 0.15, ...extra })
    }
    let s = pulse.addFrame(groove(0), clock.positionAt(0))
    for (let i = 1; i < 6 * FPS; i++) s = pulse.addFrame(groove(i * 25), clock.positionAt(i * 25))
    const held = s.section // steady 6s groove: no churn
    expect(held).toBe(0) // ~12 bars of one groove did not rotate the effect
    // A new layer enters (mids + highs jump) and stays.
    for (let i = 0; i < 3 * FPS; i++) {
      const ms = 6000 + i * 25
      s = pulse.addFrame(groove(ms, { rms: 0.55, mid: 0.5, high: 0.6 }), clock.positionAt(ms))
    }
    expect(s.section).toBeGreaterThan(held) // the new texture advanced the section
  })

  it('level tracks energy and releases toward zero on silence', () => {
    const pulse = new MusicPulse(FPS)
    const clock = clockAt(120)
    let state = pulse.addFrame(frame({ rms: 0.5, bass: 0.4 }), clock.positionAt(0))
    for (let i = 1; i < 8; i++) state = pulse.addFrame(frame({ rms: 0.5, bass: 0.4 }), clock.positionAt(i * 25))
    expect(state.level).toBeGreaterThan(0.3)
    // Go silent for ~0.5s.
    for (let i = 0; i < 20; i++) state = pulse.addFrame(frame({}), clock.positionAt(200 + i * 25))
    expect(state.level).toBeLessThan(0.02)
  })

  it('sensitivity gates faint sound: lower ignores echoes, still passes the melody', () => {
    const faintLevel = (sens: number): number => {
      const pulse = new MusicPulse(FPS)
      pulse.setSensitivity(sens)
      const clock = clockAt(120)
      let s = pulse.addFrame(frame({ rms: 0.06, bass: 0.06 }), clock.positionAt(0))
      for (let i = 1; i < 40; i++) s = pulse.addFrame(frame({ rms: 0.06, bass: 0.06 }), clock.positionAt(i * 25))
      return s.level
    }
    // A faint ~0.06 tail: low sensitivity attenuates it well below high sensitivity.
    expect(faintLevel(0.1)).toBeLessThan(faintLevel(0.9))
    expect(faintLevel(0.1)).toBeLessThan(0.05)

    // A clear melody (~0.4) passes through regardless of sensitivity.
    const melody = (sens: number): number => {
      const pulse = new MusicPulse(FPS)
      pulse.setSensitivity(sens)
      const clock = clockAt(120)
      let s = pulse.addFrame(frame({ rms: 0.4, bass: 0.3 }), clock.positionAt(0))
      for (let i = 1; i < 20; i++) s = pulse.addFrame(frame({ rms: 0.4, bass: 0.3 }), clock.positionAt(i * 25))
      return s.level
    }
    expect(melody(0.1)).toBeGreaterThan(0.3)
  })
})
