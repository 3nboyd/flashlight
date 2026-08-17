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
  /** 0-1 chance a cut waits for the beat (0 = never, 1 = always, mid = sometimes). */
  switchOnBeat: number
  drop: DropEffectSettings
}

export const DEFAULT_DIRECTOR_SETTINGS: DirectorSettings = {
  avgHoldMs: 5000,
  hysteresis: 0.18,
  switchOnBeat: 0,
  drop: { enabled: false, durationMs: 3000, effects: [] }
}

export function loadDirectorSettings(): DirectorSettings {
  try {
    const raw = JSON.parse(localStorage.getItem('djc.camera.director') ?? '{}')
    return {
      ...DEFAULT_DIRECTOR_SETTINGS,
      ...raw,
      // Was a boolean in an earlier build; coerce to the 0-1 slider.
      switchOnBeat: typeof raw.switchOnBeat === 'number' ? raw.switchOnBeat : raw.switchOnBeat ? 1 : 0,
      drop: { ...DEFAULT_DIRECTOR_SETTINGS.drop, ...(raw.drop ?? {}) }
    }
  } catch {
    return { ...DEFAULT_DIRECTOR_SETTINGS, drop: { ...DEFAULT_DIRECTOR_SETTINGS.drop } }
  }
}

export function saveDirectorSettings(s: DirectorSettings): void {
  localStorage.setItem('djc.camera.director', JSON.stringify(s))
}
