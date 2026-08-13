/**
 * The "flow" pattern library used by adaptive scenes for their no-kick parts:
 * a bright region that travels across the rig in stage order. Shared between the
 * engine (which renders it) and the scene editor (which previews and lets the
 * user enable/disable individual patterns). Each returns 0-1 brightness for a
 * pixel at normalized position `pos` (0..1) at musical time `beatVal` (beats).
 */

export interface FlowPattern {
  index: number
  name: string
  /** Human label for when this pattern is used (shown in the editor). */
  context: string
}

export const FLOW_PATTERNS: FlowPattern[] = [
  { index: 0, name: 'Side Sweep', context: 'Grooves / quiet bass' },
  { index: 1, name: 'Chase', context: 'Grooves (never drops)' },
  { index: 2, name: 'Roam', context: 'Ambient / no rhythm' },
  { index: 3, name: 'Symmetric', context: 'Quiet moments only' },
  { index: 4, name: 'Explosion', context: 'Drops & phrase starts' },
  { index: 5, name: 'Snake', context: 'Grooves (w/ strobe)' }
]

export type FlowContext = 'groove' | 'ambient'

// Weighted preference pools (repetition = how often a pattern is picked), tuned
// to the DJ's stated priorities: sweep dominates rhythmic grooves with quiet/no
// bass, explosion is common, chase/snake fill in; roam owns ambient/no-rhythm
// passages and symmetric only shows in quiet moments (never when loud).
const GROOVE_POOL = [0, 0, 0, 4, 4, 1, 5] // sweep x3, explosion x2, chase, snake
const AMBIENT_POOL = [2, 2, 2, 3] // roam x3, symmetric x1
const AMBIENT_LOUD_POOL = [2] // roam only - symmetric excluded when loud

/** Pick a no-kick flow pattern for the current musical context, honoring the
 *  scene's enabled set. `quiet` allows symmetric in ambient passages. */
export function pickFlowForContext(
  enabled: number[] | undefined,
  section: number,
  context: FlowContext,
  quiet: boolean
): number {
  const en = new Set(enabled && enabled.length > 0 ? enabled : allFlowPatterns())
  const pool = context === 'ambient' ? (quiet ? AMBIENT_POOL : AMBIENT_LOUD_POOL) : GROOVE_POOL
  const filtered = pool.filter((p) => en.has(p))
  const candidates = filtered.length > 0 ? filtered : [...en]
  return candidates[(((section % candidates.length) + candidates.length) % candidates.length)]
}

export const FLOW_PATTERN_COUNT = FLOW_PATTERNS.length

export function flowEnv(pos: number, beatVal: number, pattern: number): number {
  switch (((pattern % FLOW_PATTERN_COUNT) + FLOW_PATTERN_COUNT) % FLOW_PATTERN_COUNT) {
    case 0: {
      // Side-to-side sweep (ping-pong).
      const phase = (beatVal / 4) % 2
      const head = phase < 1 ? phase : 2 - phase
      return Math.pow(Math.max(0, 1 - Math.abs(pos - head) / 0.3), 1.5)
    }
    case 1: {
      // Running chase that wraps around the ends.
      const head = (beatVal / 3) % 1
      const raw = Math.abs(pos - head)
      return Math.pow(Math.max(0, 1 - Math.min(raw, 1 - raw) / 0.22), 1.6)
    }
    case 2: {
      // A soft glow roaming back and forth.
      const c = 0.5 + 0.42 * Math.sin(beatVal * 0.22)
      return Math.pow(Math.max(0, 1 - Math.abs(pos - c) / 0.4), 1.8)
    }
    case 3: {
      // Symmetric pair opening/closing from the center.
      const spread = (Math.sin(beatVal * 0.35) * 0.5 + 0.5) * 0.5
      const d = Math.abs(Math.abs(pos - 0.5) - spread)
      return Math.pow(Math.max(0, 1 - d / 0.16), 1.6)
    }
    case 4: {
      // Pixel explosion: a bright pair of fronts bursts out from the center and
      // fades, re-detonating every 2 beats.
      const cycle = (beatVal / 2) % 1
      const front = Math.abs(Math.abs(pos - 0.5) - cycle * 0.55)
      return Math.pow(Math.max(0, 1 - front / 0.12), 1.6) * (1 - cycle)
    }
    default: {
      // Snake: a bright head with a fading tail travelling across (wrapping).
      const head = (beatVal / 3) % 1
      const behind = (((head - pos) % 1) + 1) % 1
      const tail = 0.32
      return behind < tail ? Math.pow(1 - behind / tail, 1.4) : 0
    }
  }
}

/** The default full set of pattern indices (used when a scene enables none). */
export function allFlowPatterns(): number[] {
  return FLOW_PATTERNS.map((p) => p.index)
}

/** Resolve which pattern to run this section, honoring the scene's enabled set. */
export function pickFlowPattern(enabled: number[] | undefined, section: number, offset: number): number {
  const list = enabled && enabled.length > 0 ? enabled : allFlowPatterns()
  const i = (((section + offset) % list.length) + list.length) % list.length
  return list[i]
}
