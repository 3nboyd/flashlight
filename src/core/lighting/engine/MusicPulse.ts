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
  /** 0-1 decaying flash fired when energy leaps well above its recent baseline
   *  (a big hit out of relative quiet, a section kicking in, silence->boom).
   *  Used to strobe a "peak marker" across the rig. */
  surge: number
  /** Monotonic counter that only advances when the music's texture actually
   *  shifts (a new element / frequency change, sustained), or after a long hold
   *  - so a scene holds one look through a groove instead of churning effects. */
  section: number
  /** 0-1 how rhythmic/percussive the audio is (onset density): high = a groove
   *  with a beat, low = ambient/wash. Distinguishes groove from ambient looks. */
  rhythm: number
}

export class MusicPulse {
  private readonly fps: number
  private energyLevel = 0
  private energyFast = 0
  private energyBaseline = 0
  private surgeEnv = 0
  private lastSurgeFrame = -Infinity
  private bassMid = 0
  private midMid = 0
  private highMid = 0
  private levelMid = 0
  private sectionRef: { bass: number; mid: number; high: number; level: number } | null = null
  private sectionChangeSince: number | null = null
  private section = 0
  private lastSectionFrame = -Infinity
  private lastSectionBeat = 0
  private onsetRate = 0
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
    this.energyBaseline = 0
    this.surgeEnv = 0
    this.lastSurgeFrame = -Infinity
    this.sectionRef = null
    this.sectionChangeSince = null
    this.lastSectionFrame = -Infinity
    this.lastSectionBeat = 0
    this.onsetRate = 0
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

    // Surge/peak marker: the fast envelope leaps well above a slow, lagging
    // baseline (a loud hit out of relative quiet, a section kicking in, or
    // silence->boom). A steady loud passage lets the baseline catch up, so it
    // only fires on genuine jumps - not on every beat. Brief decaying flash.
    this.surgeEnv *= Math.exp(-1 / (this.fps * 0.1))
    // Only a genuinely big jump marks a peak (raised threshold + longer gap so
    // it isn't strobing on every stab).
    const bigJump = this.energyFast - this.energyBaseline > 0.36 && this.energyFast > 0.38
    if (bigJump && this.frames - this.lastSurgeFrame > this.fps * 1.0) {
      this.surgeEnv = 1
      this.lastSurgeFrame = this.frames
    }
    // Baseline lags real hits but catches a sustained level within the
    // refractory window, so a steady loud passage only marks its onset.
    this.energyBaseline += (1 - Math.exp(-1 / (this.fps * 0.2))) * (energy - this.energyBaseline)

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

    // --- Section / musical-change detection -------------------------------
    // Track the medium-term spectral texture; advance the section only when it
    // drifts far from the reference (a real, sustained change) or after a long
    // hold, so a steady groove keeps one look instead of churning effects.
    const aMid = 1 - Math.exp(-1 / (this.fps * 0.9))
    this.bassMid += aMid * (features.bass - this.bassMid)
    this.midMid += aMid * (features.mid - this.midMid)
    this.highMid += aMid * (features.high - this.highMid)
    this.levelMid += aMid * (energy - this.levelMid)
    const cur = { bass: this.bassMid, mid: this.midMid, high: this.highMid, level: this.levelMid }
    // Re-anchor while the EMAs are still settling (or before any reference), so
    // the warm-up ramp is not mistaken for a real texture change.
    if (this.sectionRef === null || this.frames < this.fps * 3) {
      this.sectionRef = cur
      this.lastSectionBeat = beat.beat
    }
    const r = this.sectionRef
    const dist =
      Math.abs(cur.bass - r.bass) * 1.3 +
      Math.abs(cur.mid - r.mid) +
      Math.abs(cur.high - r.high) * 1.1 +
      Math.abs(cur.level - r.level) * 1.2
    if (dist > 0.28) this.sectionChangeSince ??= this.frames
    else this.sectionChangeSince = null
    const sustainedChange =
      this.sectionChangeSince !== null && (this.frames - this.sectionChangeSince) / this.fps > 1.2
    const longHold = beat.beat - this.lastSectionBeat > 64 // ~16 bars fallback
    // Quantize changes to a bar line ("come in on the beat"), but a very big
    // jump (a drop) may land anywhere. Never change more than every ~2s.
    const onBar = beat.barPhase < 0.2 || dist > 0.5
    if ((sustainedChange || longHold) && onBar && this.frames - this.lastSectionFrame > this.fps * 2) {
      this.section += 1
      this.sectionRef = cur
      this.sectionChangeSince = null
      this.lastSectionFrame = this.frames
      this.lastSectionBeat = beat.beat
    }

    // Rhythmicity: onset density (fraction of frames with an onset), ~1.5s EMA.
    this.onsetRate += (1 - Math.exp(-1 / (this.fps * 1.5))) * ((features.onset ? 1 : 0) - this.onsetRate)
    const rhythm = Math.min(1, this.onsetRate * 12)

    return {
      level: this.energyLevel,
      kick: this.kickConfidence,
      fast: this.energyFast,
      surge: this.surgeEnv,
      section: this.section,
      rhythm
    }
  }
}
