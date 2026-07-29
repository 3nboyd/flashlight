/**
 * Performance pads can hold a scene id or a control "function" (blackout,
 * strobe, blinder, tap, ...). Functions are stored in the pad array as a
 * "fn:<kind>" token so they persist alongside scene ids without a new field.
 */

export type PadFunctionKind =
  | 'blackout'
  | 'strobe'
  | 'blinder'
  | 'manual'
  | 'tap'
  | 'resync'
  | 'autopilot'

export interface PadFunctionInfo {
  kind: PadFunctionKind
  label: string
  hint: string
  uiColor: string
  /** Momentary functions fire while held (strobe, blinder); others toggle/tap. */
  momentary: boolean
}

export const PAD_FUNCTIONS: PadFunctionInfo[] = [
  { kind: 'blackout', label: 'Blackout', hint: 'Toggle all lights off', uiColor: '#0b1220', momentary: false },
  { kind: 'strobe', label: 'Strobe', hint: 'Strobe everything while held', uiColor: '#e5e7eb', momentary: true },
  { kind: 'blinder', label: 'Blinder', hint: 'Full white while held', uiColor: '#fde68a', momentary: true },
  { kind: 'manual', label: 'Tap Pulse', hint: 'Tap to flash a Tap Pulse scene (cycles color)', uiColor: '#f472b6', momentary: false },
  { kind: 'tap', label: 'Tap Tempo', hint: 'Tap along to set BPM', uiColor: '#38bdf8', momentary: false },
  { kind: 'resync', label: 'Sync 1', hint: 'Snap the downbeat to now', uiColor: '#22d3ee', momentary: false },
  { kind: 'autopilot', label: 'Autopilot', hint: 'Toggle automatic scene changes', uiColor: '#a78bfa', momentary: false }
]

const PREFIX = 'fn:'

export function padFunctionToken(kind: PadFunctionKind): string {
  return PREFIX + kind
}

export function parsePadFunction(value: string | null | undefined): PadFunctionKind | null {
  if (!value || !value.startsWith(PREFIX)) return null
  const kind = value.slice(PREFIX.length)
  return PAD_FUNCTIONS.some((f) => f.kind === kind) ? (kind as PadFunctionKind) : null
}

export function padFunctionInfo(kind: PadFunctionKind): PadFunctionInfo {
  return PAD_FUNCTIONS.find((f) => f.kind === kind)!
}
