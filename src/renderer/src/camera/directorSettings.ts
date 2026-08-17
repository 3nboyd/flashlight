/**
 * User-facing settings for the auto-director (persisted in localStorage). The
 * pure CameraDirector core takes min/max hold + hysteresis; here we expose a
 * friendlier "average shot length" and a decisiveness value, plus the on-beat
 * switch and the beat-drop effect feature.
 */
export interface DropEffectSettings {
  /** Fire a camera effect on a detected drop. */
  enabled: boolean
  /** How long the effect stays up after a drop (ms). */
  durationMs: number
  /** Visual ids allowed to fire (one is picked at random per drop). */
  effects: string[]
}

export interface DirectorSettings {
  /** Target average time on a shot before cutting (ms). */
  avgHoldMs: number
  /** How decisively a better shot must win to cut (lower = cuts more readily). */
  hysteresis: number
  /** Quantize discretionary cuts to the beat. */
  switchOnBeat: boolean
  drop: DropEffectSettings
}

export const DEFAULT_DIRECTOR_SETTINGS: DirectorSettings = {
  avgHoldMs: 5000,
  hysteresis: 0.18,
  switchOnBeat: false,
  drop: { enabled: false, durationMs: 3000, effects: [] }
}

export function loadDirectorSettings(): DirectorSettings {
  try {
    const raw = JSON.parse(localStorage.getItem('djc.camera.director') ?? '{}')
    return {
      ...DEFAULT_DIRECTOR_SETTINGS,
      ...raw,
      drop: { ...DEFAULT_DIRECTOR_SETTINGS.drop, ...(raw.drop ?? {}) }
    }
  } catch {
    return { ...DEFAULT_DIRECTOR_SETTINGS, drop: { ...DEFAULT_DIRECTOR_SETTINGS.drop } }
  }
}

export function saveDirectorSettings(s: DirectorSettings): void {
  localStorage.setItem('djc.camera.director', JSON.stringify(s))
}
