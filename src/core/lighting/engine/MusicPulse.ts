import type { AudioFeatures } from '../audio/features'
import type { BeatPosition } from './BeatClock'

/**
 * Distinguishes a real, driving bass DRUM from mere bass energy (sustained
 * synth bass, a low melody) so adaptive scenes only "hard flash" on an actual
 * consistent quarter-note kick, and otherwise stay in responsive/flow looks.
 *
 * Two outputs per frame:
 *  - `level`: a smoothed overall energy envelope (instant attack, slow release)
 *    used to gate darkness / detect a true pause. Slow release bridges the gaps
 *    between hits so a beat does not flicker to black between kicks.
 *  - `kick`: 0-1 confidence that a consistent, on-grid kick drum is playing. It
 *    only rises on BASS TRANSIENTS (a sharp rise of the bass band above its own
 *    recent floor) that land near a beat, and decays unless they keep coming -
 *    so a held bass note or an off-grid melody never reads as a kick.
 *
 * Deterministic EMAs + thresholds (no ML), so it is predictable and testable.
 */

export interface PulseState {
  level: number
  kick: number
  /** Fast energy envelope (instant attack, ~45ms release) for tight cut-in /
   *  cut-out response - scratching and stabs track the audio almost 1:1. */
  fast: number
}

export class MusicPulse {
  private readonly fps: number
  private energyLevel = 0
  private energyFast = 0
  private bassFast = 0
  private bassSlow = 0
  private prevExcess = 0
  private lastOnsetFrame = -Infinity
  private kickConfidence = 0
  private frames = 0

  constructor(framesPerSecond = 40) {
    this.fps = framesPerSecond
  }

  reset(): void {
    this.energyLevel = 0
    this.energyFast = 0
    this.bassFast = 0
    this.bassSlow = 0
    this.prevExcess = 0
    this.kickConfidence = 0
    this.lastOnsetFrame = -Infinity
  }

  addFrame(features: AudioFeatures, beat: BeatPosition): PulseState {
    this.frames += 1

    // Smoothed energy: instant attack, ~120ms release. Because it snaps to each
    // hit's peak, the decay from that peak still bridges the gap to the next
    // hit (no flicker), while a true pause crosses the floor in ~0.4s.
    const energy = Math.max(features.rms, features.bass * 0.9)
    if (energy > this.energyLevel) this.energyLevel = energy
    else this.energyLevel += (1 - Math.exp(-1 / (this.fps * 0.12))) * (energy - this.energyLevel)

    // Fast envelope: instant attack, ~45ms release, so a scratch cut drops it
    // almost immediately and a cut-in snaps it back.
    const fastEnergy = Math.max(features.rms, features.bass * 0.8, features.high * 0.7)
    if (fastEnergy > this.energyFast) this.energyFast = fastEnergy
    else this.energyFast += (1 - Math.exp(-1 / (this.fps * 0.045))) * (fastEnergy - this.energyFast)

    // Bass transient = fast bass envelope pushing above its slow floor.
    this.bassFast += (1 - Math.exp(-1 / (this.fps * 0.05))) * (features.bass - this.bassFast)
    this.bassSlow += (1 - Math.exp(-1 / (this.fps * 0.35))) * (features.bass - this.bassSlow)
    const excess = this.bassFast - this.bassSlow

    // Confidence decays continuously (~1.8s), so it stays high through steady
    // kicks and survives a single missed hit, but falls once they stop.
    this.kickConfidence *= Math.exp(-1 / (this.fps * 1.8))

    const refractoryOk = this.frames - this.lastOnsetFrame > this.fps * 0.1
    const risingEdge = excess > 0.03 && this.prevExcess <= 0.03
    if (risingEdge && refractoryOk) {
      this.lastOnsetFrame = this.frames
      const distToBeat = Math.min(beat.beatPhase, 1 - beat.beatPhase)
      // A kick is a RELATIVE punch - the fast bass leaps well above its own
      // recent floor - so even a quiet kick on low input registers, while a
      // sustained bass note (fast ~= slow) never does. Plus a tiny noise floor.
      const punchy = this.bassFast > this.bassSlow * 1.5 && this.bassFast > 0.04
      if (distToBeat < 0.19 && punchy) {
        this.kickConfidence = Math.min(1, this.kickConfidence + 0.4)
      }
    }
    this.prevExcess = excess

    return { level: this.energyLevel, kick: this.kickConfidence, fast: this.energyFast }
  }
}
