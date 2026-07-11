import type { AudioFeatures } from '../audio/features'
import type { BeatPosition } from './BeatClock'

/**
 * Smart Mode: an automatic VJ. Watches the live audio's energy structure
 * (with the beat grid supplied by OS2L or audio analysis) and drives the
 * show through a four-phase model of dance music:
 *
 *   steady ──rising energy──▶ build ──bass slam──▶ drop ──1 phrase──▶ steady
 *      │◀──energy returns── break ◀──energy collapses──┘ (or from steady)
 *
 *   - steady: rotate through the "main" scene pool on phrase boundaries
 *   - build:  keep the look, ramp intensity with the riser's progress
 *   - drop:   slam a "peak" scene at full intensity for one phrase
 *   - break:  fall to a "chill" scene at reduced intensity
 *
 * Detection is deterministic - EMAs, slopes, and thresholds, no ML - so
 * behavior is predictable and unit-testable. All timings derive from the
 * frame rate; thresholds scale with one user-facing sensitivity knob.
 */

export type SmartPhase = 'steady' | 'build' | 'drop' | 'break'

export interface SmartPools {
  chill: string[]
  main: string[]
  peak: string[]
}

export interface SmartConfig {
  pools: SmartPools
  /**
   * MAXIMUM hold in 8-bar phrases: while steady, a scene keeps playing
   * until the track's mood actually shifts (see mood tracking below), but
   * never longer than this many phrases.
   */
  phrasesPerScene: number
  /** 0-1, default 0.5. Higher = more eager build/drop/mood detection. */
  sensitivity: number
  /**
   * How each main-pool scene reads visually, derived from its effects:
   * 'reactive' scenes (bass/audio/beat-driven) suit stripped-back,
   * bass-and-drums passages; 'flow' scenes (color cycles, movement) suit
   * fuller musical sections. Optional - without it, picks are round-robin.
   */
  sceneCharacter?: Record<string, 'reactive' | 'flow'>
}

export interface SmartDecision {
  phase: SmartPhase
  /** Scene to switch to now; null = keep whatever is playing. */
  sceneId: string | null
  /** Suggested master-intensity multiplier (0-1). */
  intensity: number
  /** 0-1 progress through a detected build-up. */
  buildProgress: number
}

export const DEFAULT_SMART_CONFIG: SmartConfig = {
  pools: { chill: [], main: [], peak: [] },
  phrasesPerScene: 2,
  sensitivity: 0.5
}

/** Frames of history for the short-trend window (~3s at 40fps). */
const TREND_WINDOW_SECONDS = 3

export class SmartModeEngine {
  private config: SmartConfig = DEFAULT_SMART_CONFIG
  private readonly fps: number

  private emaShort = 0
  private emaLong = 0
  private highShort = 0
  private highLong = 0
  private bassLong = 0
  private onsetRate = 0
  /** Medium EMAs (τ≈2s) for mood tracking: fast enough to settle quickly on
   *  a stable signal (no warm-up false shifts), slow enough to ignore
   *  per-beat ripple; the 3s sustain requirement does the rest. */
  private energyMid = 0
  private bassMid = 0
  private highMid = 0
  private readonly trend: number[] = []
  private frames = 0

  /** Mood snapshot at the last steady scene change; rotation happens when
   *  the live mood drifts far enough from this reference. */
  private moodRef: { energy: number; bassBalance: number; highBalance: number } | null = null
  private moodShiftSinceFrame: number | null = null
  private lastRotationBar = -1

  private phase: SmartPhase = 'steady'
  private phaseStartFrame = 0
  private buildStartFrame = 0
  private lastDropFrame = -Infinity
  private belowSinceFrame: number | null = null

  private mainRotation = 0
  private peakRotation = 0
  private chillRotation = 0
  private dropStartBar = 0

  constructor(framesPerSecond = 40) {
    this.fps = framesPerSecond
  }

  updateConfig(config: SmartConfig): void {
    this.config = config
  }

  getPhase(): SmartPhase {
    return this.phase
  }

  /** Reset transient state (call when smart mode is switched on). */
  reset(): void {
    this.phase = 'steady'
    this.phaseStartFrame = this.frames
    this.belowSinceFrame = null
    this.moodRef = null
    this.moodShiftSinceFrame = null
    this.lastRotationBar = -1
  }

  private seconds(frames: number): number {
    return frames / this.fps
  }

  private pick(pool: string[], rotation: number): string | null {
    if (pool.length === 0) return null
    return pool[rotation % pool.length]
  }

  /** Live mood: overall level plus how bass- or high-weighted the mix is. */
  private currentMood(): { energy: number; bassBalance: number; highBalance: number } {
    const total = this.bassMid + this.highMid + 0.0001
    return {
      energy: this.energyMid,
      bassBalance: this.bassMid / total,
      highBalance: this.highMid / total
    }
  }

  private moodDistance(a: { energy: number; bassBalance: number; highBalance: number }): number {
    const b = this.currentMood()
    return (
      Math.abs(a.energy - b.energy) * 1.6 +
      Math.abs(a.bassBalance - b.bassBalance) * 1.2 +
      Math.abs(a.highBalance - b.highBalance) * 1.2
    )
  }

  /**
   * Picks the next main scene to fit the track's current texture: stripped
   * bass-and-drums passages get 'reactive' scenes (bass/beat-driven looks),
   * fuller sections get 'flow' scenes. Falls back to round-robin.
   */
  private pickMainForTexture(): string | null {
    const pool = this.config.pools.main
    if (pool.length === 0) return null
    this.mainRotation += 1
    const character = this.config.sceneCharacter
    if (!character) return this.pick(pool, this.mainRotation)

    const mood = this.currentMood()
    const wantReactive = mood.bassBalance > 0.62 // bass-dominant, sparse top end
    const preferred = pool.filter((id) => (character[id] ?? 'flow') === (wantReactive ? 'reactive' : 'flow'))
    const candidates = preferred.length > 0 ? preferred : pool
    return this.pick(candidates, this.mainRotation)
  }

  addFrame(features: AudioFeatures, beat: BeatPosition): SmartDecision {
    this.frames += 1
    const energy = features.bass * 0.65 + features.rms * 0.35

    // EMAs: short tracks the moment, long tracks the track's baseline.
    const alphaShort = 1 - Math.exp(-1 / (this.fps * 0.5))
    const alphaLong = 1 - Math.exp(-1 / (this.fps * 8))
    const alphaHigh = 1 - Math.exp(-1 / (this.fps * 1))
    this.emaShort += alphaShort * (energy - this.emaShort)
    this.emaLong += alphaLong * (energy - this.emaLong)
    this.highShort += alphaHigh * (features.high - this.highShort)
    this.highLong += alphaLong * (features.high - this.highLong)
    this.bassLong += alphaLong * (features.bass - this.bassLong)
    this.onsetRate += alphaLong * ((features.onset ? 1 : 0) - this.onsetRate)
    const alphaMid = 1 - Math.exp(-1 / (this.fps * 2))
    this.energyMid += alphaMid * (energy - this.energyMid)
    this.bassMid += alphaMid * (features.bass - this.bassMid)
    this.highMid += alphaMid * (features.high - this.highMid)

    this.trend.push(this.emaShort)
    const trendFrames = Math.round(this.fps * TREND_WINDOW_SECONDS)
    while (this.trend.length > trendFrames) this.trend.shift()

    // Per-second slope of the short EMA across the trend window.
    const slope =
      this.trend.length >= trendFrames
        ? (this.trend[this.trend.length - 1] - this.trend[0]) / TREND_WINDOW_SECONDS
        : 0

    const sens = 0.5 + this.config.sensitivity // 0.5..1.5 threshold scaler (higher = easier)
    const framesInPhase = this.frames - this.phaseStartFrame

    let sceneId: string | null = null
    let intensity = 1
    let buildProgress = 0

    switch (this.phase) {
      case 'steady': {
        intensity = 1
        // Mood-hold rotation: a scene keeps playing while the track keeps
        // doing the same thing. Rotation happens on a phrase boundary only
        // once the mood (level + spectral balance) has genuinely shifted -
        // or when the max hold elapses as a fallback.
        // Keep re-anchoring the reference while the long EMAs warm up (or
        // right after a phase change), so settling baselines don't read as
        // a mood shift.
        if (this.seconds(framesInPhase) < 8 || this.moodRef === null) {
          this.moodRef = this.currentMood()
          this.moodShiftSinceFrame = null
        }
        if (this.lastRotationBar < 0) this.lastRotationBar = beat.barIndex

        const moodThreshold = 0.12 / sens
        if (this.moodDistance(this.moodRef) > moodThreshold) {
          this.moodShiftSinceFrame ??= this.frames
        } else {
          this.moodShiftSinceFrame = null
        }
        const moodShifted =
          this.moodShiftSinceFrame !== null && this.seconds(this.frames - this.moodShiftSinceFrame) > 3

        const phraseBoundary = beat.barIndex % 8 === 0 && beat.barPhase < 0.5
        const phrasesHeld = (beat.barIndex - this.lastRotationBar) / 8
        const maxHold = Math.max(1, this.config.phrasesPerScene)
        if (phraseBoundary && phrasesHeld >= 1 && (moodShifted || phrasesHeld >= maxHold)) {
          sceneId = this.pickMainForTexture()
          this.lastRotationBar = beat.barIndex
          this.moodRef = this.currentMood()
          this.moodShiftSinceFrame = null
        }

        // Breakdown: energy collapses well below the track's baseline.
        if (this.emaLong > 0.05 && this.emaShort < this.emaLong * (0.45 * (2 - sens))) {
          this.belowSinceFrame ??= this.frames
          if (this.seconds(this.frames - this.belowSinceFrame) > 1.5) {
            this.phase = 'break'
            this.phaseStartFrame = this.frames
            this.chillRotation += 1
            sceneId = this.pick(this.config.pools.chill, this.chillRotation)
            intensity = 0.7
            break
          }
        } else {
          this.belowSinceFrame = null
        }

        // Direct drop: a bass slam out of nowhere (hard cut-drops without a
        // long telegraphed build). Requires a genuine transient - bass far
        // above even the SHORT-term level - so smooth ramps don't trigger it.
        const slamThreshold = Math.max(0.6, this.emaShort * 1.6, this.emaLong * (1.35 / sens))
        if (
          this.seconds(framesInPhase) > 4 &&
          this.seconds(this.frames - this.lastDropFrame) > 16 &&
          features.bass > slamThreshold
        ) {
          this.phase = 'drop'
          this.phaseStartFrame = this.frames
          this.lastDropFrame = this.frames
          this.dropStartBar = beat.barIndex
          this.peakRotation += 1
          sceneId = this.pick(this.config.pools.peak, this.peakRotation)
          intensity = 1
          break
        }

        // Build-up: sustained energy rise plus rising highs (risers/snares).
        const buildSlopeThreshold = 0.03 / sens
        if (
          this.seconds(framesInPhase) > 4 &&
          slope > buildSlopeThreshold &&
          this.highShort > this.highLong * 1.1
        ) {
          this.phase = 'build'
          this.phaseStartFrame = this.frames
          this.buildStartFrame = this.frames
          intensity = 0.8
        }
        break
      }

      case 'build': {
        buildProgress = Math.min(1, this.seconds(this.frames - this.buildStartFrame) / 10)
        // Tension ramp: 80% → 100% intensity across the build.
        intensity = 0.8 + 0.2 * buildProgress

        // The drop: bass SLAMS - a transient leap above even the short-term
        // level, not just the ramp itself crossing the lagging baseline.
        const dropThreshold = Math.max(0.5, this.emaShort * 1.2, this.emaLong * (1.35 / sens))
        const dropReady =
          this.seconds(this.frames - this.buildStartFrame) > 2 &&
          this.seconds(this.frames - this.lastDropFrame) > 16
        if (dropReady && features.bass > dropThreshold) {
          this.phase = 'drop'
          this.phaseStartFrame = this.frames
          this.lastDropFrame = this.frames
          this.dropStartBar = beat.barIndex
          this.peakRotation += 1
          sceneId = this.pick(this.config.pools.peak, this.peakRotation)
          intensity = 1
          break
        }

        // Fizzled build (energy stops rising for a while) → back to steady.
        if (slope < 0 && this.seconds(this.frames - this.buildStartFrame) > 6) {
          this.phase = 'steady'
          this.phaseStartFrame = this.frames
        }
        break
      }

      case 'drop': {
        intensity = 1
        // Ride the drop for one 8-bar phrase (15s cap for slow/absent beat
        // grids), then hand back to steady with the peak scene still playing.
        if (beat.barIndex >= this.dropStartBar + 8 || this.seconds(framesInPhase) > 15) {
          this.phase = 'steady'
          this.phaseStartFrame = this.frames
          // Re-anchor mood tracking so the post-drop groove sets the reference.
          this.lastRotationBar = beat.barIndex
          this.moodRef = null
          this.moodShiftSinceFrame = null
        }
        break
      }

      case 'break': {
        intensity = 0.7
        // Recovery: energy returns toward baseline → steady; a hard bass
        // return after a quiet break is treated as a drop.
        if (this.emaShort > this.emaLong * 0.8) {
          const hardReturn =
            features.bass > Math.max(0.6, this.emaShort * 1.6, this.emaLong * (1.3 / sens)) &&
            this.seconds(this.frames - this.lastDropFrame) > 16
          if (hardReturn) {
            this.phase = 'drop'
            this.phaseStartFrame = this.frames
            this.lastDropFrame = this.frames
            this.dropStartBar = beat.barIndex
            this.peakRotation += 1
            sceneId = this.pick(this.config.pools.peak, this.peakRotation)
            intensity = 1
          } else {
            this.phase = 'steady'
            this.phaseStartFrame = this.frames
            sceneId = this.pickMainForTexture()
            this.lastRotationBar = beat.barIndex
            this.moodRef = null
            this.moodShiftSinceFrame = null
            intensity = 1
          }
        }
        break
      }
    }

    return { phase: this.phase, sceneId, intensity, buildProgress }
  }
}
