/**
 * The musical timebase every effect runs against. Tracks BPM and a beat
 * phase anchored to a timestamp, and exposes continuous beat/bar/phrase
 * positions so effects lock to the music instead of wall-clock time.
 *
 * BPM sources, in practice: audio BPM estimation (BpmEstimator), tap tempo,
 * or manual entry. Detected onsets can gently re-anchor the phase so the
 * "1" drifts back onto the actual kick.
 */

const BEATS_PER_BAR = 4
const BARS_PER_PHRASE = 8

export interface BeatPosition {
  /** Continuous beat counter since anchor (fractional). */
  beat: number
  /** 0-1 phase within the current beat. */
  beatPhase: number
  /** 0-1 phase within the current 4-beat bar. */
  barPhase: number
  /** 0-1 phase within the current 8-bar phrase. */
  phrasePhase: number
  /** Integer index of the current bar since anchor. */
  barIndex: number
}

export class BeatClock {
  private bpm = 128
  private anchorMs = 0
  private readonly tapTimes: number[] = []

  getBpm(): number {
    return this.bpm
  }

  setBpm(bpm: number, nowMs: number): void {
    if (bpm < 20 || bpm > 300) return
    // Re-anchor preserving current phase so a BPM nudge doesn't jump the beat.
    const position = this.positionAt(nowMs)
    this.bpm = bpm
    this.anchorMs = nowMs - (position.beatPhase * 60000) / bpm
  }

  /** Snap the beat "1" to now (e.g. hit on a downbeat, or from a detected onset). */
  resyncDownbeat(nowMs: number): void {
    this.anchorMs = nowMs
  }

  /**
   * Hard-sync to an external beat grid (OS2L): the DJ software says "beat
   * number `beatIndex` is happening right now at `bpm`". Anchoring so our
   * continuous beat counter equals beatIndex at nowMs makes bars (pos % 4)
   * and 8-bar phrases (pos % 32) line up exactly with the deck's grid.
   */
  syncToExternalBeat(bpm: number, beatIndex: number, nowMs: number): void {
    if (bpm < 20 || bpm > 300) return
    this.bpm = bpm
    this.anchorMs = nowMs - (beatIndex * 60000) / bpm
  }

  /**
   * Gently pull the phase toward a detected onset instead of hard-snapping,
   * so occasional false onsets don't wreck an otherwise locked groove.
   */
  nudgeTowardOnset(onsetMs: number, strength = 0.15): void {
    const beatMs = 60000 / this.bpm
    const phase = ((onsetMs - this.anchorMs) % beatMs) / beatMs
    // Distance to the nearest beat edge, signed, in ms.
    const errorMs = (phase > 0.5 ? phase - 1 : phase) * beatMs
    this.anchorMs += errorMs * strength
  }

  /** Register a tap; after 2+ taps the BPM is derived from their spacing. */
  tap(nowMs: number): void {
    // Taps more than 2s apart start a fresh measurement.
    if (this.tapTimes.length > 0 && nowMs - this.tapTimes[this.tapTimes.length - 1] > 2000) {
      this.tapTimes.length = 0
    }
    this.tapTimes.push(nowMs)
    if (this.tapTimes.length > 8) this.tapTimes.shift()

    if (this.tapTimes.length >= 2) {
      const intervals: number[] = []
      for (let i = 1; i < this.tapTimes.length; i++) {
        intervals.push(this.tapTimes[i] - this.tapTimes[i - 1])
      }
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const bpm = 60000 / avgMs
      if (bpm >= 20 && bpm <= 300) {
        this.bpm = Math.round(bpm * 10) / 10
        this.anchorMs = nowMs // taps land on beats: anchor to the latest tap
      }
    }
  }

  positionAt(nowMs: number): BeatPosition {
    const beatMs = 60000 / this.bpm
    const beat = Math.max(0, (nowMs - this.anchorMs) / beatMs)
    const beatPhase = beat - Math.floor(beat)
    const barPosition = beat / BEATS_PER_BAR
    const barPhase = barPosition - Math.floor(barPosition)
    const phrasePosition = barPosition / BARS_PER_PHRASE
    const phrasePhase = phrasePosition - Math.floor(phrasePosition)
    return {
      beat,
      beatPhase,
      barPhase,
      phrasePhase,
      barIndex: Math.floor(barPosition)
    }
  }
}
