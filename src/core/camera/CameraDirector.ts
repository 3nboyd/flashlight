import type { CameraRole } from './roles'

/**
 * The auto-director: given a per-camera "signal" each frame, it decides which
 * camera the program (recording / live cut) should be on. It behaves like a
 * human vision mixer - holds a shot for a minimum time, needs a clear reason to
 * cut, forces variety on long holds, and follows role-specific rules.
 *
 * Pure and deterministic (time is passed in) so it can be unit tested and reused
 * on both the live cut and an offline pass over recorded framing logs.
 */

/** One camera's live framing signal (all 0-1 unless noted). */
export interface CameraSignal {
  id: string
  role: CameraRole
  /** A person is detected in frame. */
  present: number
  /** Overall movement energy in frame. */
  motion: number
  /** How head-on the subject faces THIS camera (1 = looking right at it). */
  facing: number
  /** Subject is looking down/at the deck rather than at this camera. Drives the
   *  laptop rule: the laptop cam is only useful when the DJ works the board. */
  lookingAtBoard: number
}

/** Music/context the director can lean on (e.g. cut to crowd on a drop). */
export interface DirectorContext {
  nowMs: number
  audioLevel: number
  surge: number
}

export interface DirectorConfig {
  /** Never cut away from a shot before this long (avoids seizure cuts). */
  minHoldMs: number
  /** Force a cut for variety after this long on one shot. */
  maxHoldMs: number
  /** A challenger must beat the current shot's score by this fraction to cut. */
  hysteresis: number
}

export const DEFAULT_DIRECTOR_CONFIG: DirectorConfig = {
  minHoldMs: 2500,
  maxHoldMs: 12000,
  hysteresis: 0.18
}

const ROLE_BASE: Record<CameraRole, number> = {
  headon: 1.0,
  side: 0.72,
  overhead: 0.62,
  crowd: 0.68,
  laptop: 0.0, // only becomes eligible via the laptop rule below
  other: 0.52
}

export interface DirectorDecision {
  activeId: string | null
  /** True on the frame where the active camera changed. */
  cut: boolean
}

export class CameraDirector {
  private cfg: DirectorConfig
  private activeId: string | null = null
  private lastCutMs = 0
  private manualId: string | null = null

  constructor(config: Partial<DirectorConfig> = {}) {
    this.cfg = { ...DEFAULT_DIRECTOR_CONFIG, ...config }
  }

  /** Force a specific camera (operator override), or null to resume auto. */
  setManual(id: string | null): void {
    this.manualId = id
  }

  get manual(): string | null {
    return this.manualId
  }

  get active(): string | null {
    return this.activeId
  }

  reset(): void {
    this.activeId = null
    this.lastCutMs = 0
    this.manualId = null
  }

  /** Score how much we want to be on a camera right now (0 = ineligible). */
  score(s: CameraSignal, ctx: DirectorContext): number {
    const base = ROLE_BASE[s.role]
    switch (s.role) {
      case 'laptop': {
        // The laptop is off to the side. Only cut to it when the DJ is clearly
        // working the board (looking down/away), never when they are face-on to
        // the laptop screen. Requires a person in frame.
        const working = s.lookingAtBoard >= 0.5 && s.facing < 0.55 && s.present > 0.4
        if (!working) return 0
        return 0.9 * s.lookingAtBoard + 0.2 * s.motion
      }
      case 'headon':
        if (s.present < 0.25) return 0.06
        return base * (0.35 + 0.65 * s.facing) * (0.5 + 0.5 * s.present) + 0.2 * s.motion
      case 'crowd':
        // The dancefloor pops on louder / build moments.
        return base * (0.55 + 0.6 * ctx.audioLevel) + 0.35 * ctx.surge + 0.1 * s.motion
      case 'overhead':
        if (s.present < 0.2) return base * 0.35
        return base * (0.5 + 0.5 * s.motion) + 0.25 * ctx.surge
      case 'side':
        if (s.present < 0.25) return 0.1
        return base * (0.4 + 0.6 * s.present) + 0.3 * s.motion
      default:
        return base * (0.4 + 0.6 * s.present) + 0.2 * s.motion
    }
  }

  /** Decide the active camera for this frame. */
  update(signals: CameraSignal[], ctx: DirectorContext): DirectorDecision {
    if (signals.length === 0) {
      const changed = this.activeId !== null
      this.activeId = null
      return { activeId: null, cut: changed }
    }

    // Manual override wins (as long as the chosen camera still exists).
    if (this.manualId && signals.some((s) => s.id === this.manualId)) {
      const cut = this.activeId !== this.manualId
      if (cut) this.lastCutMs = ctx.nowMs
      this.activeId = this.manualId
      return { activeId: this.activeId, cut }
    }

    const scored = signals.map((s) => ({ id: s.id, score: this.score(s, ctx) }))
    const best = scored.reduce((a, b) => (b.score > a.score ? b : a))

    // First shot, or the current camera vanished.
    if (this.activeId === null || !signals.some((s) => s.id === this.activeId)) {
      this.activeId = best.id
      this.lastCutMs = ctx.nowMs
      return { activeId: this.activeId, cut: true }
    }

    const current = scored.find((s) => s.id === this.activeId)!
    const held = ctx.nowMs - this.lastCutMs

    // Hold the shot for the minimum time no matter what.
    if (held < this.cfg.minHoldMs) return { activeId: this.activeId, cut: false }

    const bestOther = scored
      .filter((s) => s.id !== this.activeId)
      .reduce<{ id: string; score: number } | null>((a, b) => (a && a.score >= b.score ? a : b), null)

    const forceVariety = held >= this.cfg.maxHoldMs
    const clearlyBetter =
      bestOther != null && bestOther.score > current.score * (1 + this.cfg.hysteresis)

    if (bestOther && (clearlyBetter || (forceVariety && bestOther.score > 0.05))) {
      this.activeId = bestOther.id
      this.lastCutMs = ctx.nowMs
      return { activeId: this.activeId, cut: true }
    }
    return { activeId: this.activeId, cut: false }
  }
}
