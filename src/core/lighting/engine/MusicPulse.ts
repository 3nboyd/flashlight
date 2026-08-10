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
}

export class MusicPulse {
  private readonly fps: number
  private energyLevel = 0
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

    // Bass transient = fast bass envelope pushing above its slow floor.
    this.bassFast += (1 - Math.exp(-1 / (this.fps * 0.05))) * (features.bass - this.bassFast)
    this.bassSlow += (1 - Math.exp(-1 / (this.fps * 0.35))) * (features.bass - this.bassSlow)
    const excess = this.bassFast - this.bassSlow

    // Confidence decays continuously (~1.1s), so it stays high only while
    // on-grid transients keep arriving (a real, repeating kick).
    this.kickConfidence *= Math.exp(-1 / (this.fps * 1.1))

    const refractoryOk = this.frames - this.lastOnsetFrame > this.fps * 0.11
    const risingEdge = excess > 0.05 && this.prevExcess <= 0.05
    if (risingEdge && refractoryOk) {
      this.lastOnsetFrame = this.frames
      const distToBeat = Math.min(beat.beatPhase, 1 - beat.beatPhase)
      // Punchy AND on the beat grid -> looks like a kick drum, not a synth pad.
      if (distToBeat < 0.17 && this.bassFast > 0.12) {
        this.kickConfidence = Math.min(1, this.kickConfidence + 0.42)
      }
    }
    this.prevExcess = excess

    return { level: this.energyLevel, kick: this.kickConfidence }
  }
}
