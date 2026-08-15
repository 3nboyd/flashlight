/**
 * MIDI controller mapping types, in core so they can live inside the saved
 * LightingProject (persisted to disk + backups) rather than only in the
 * renderer's localStorage. Mappings are device-agnostic, keyed by note / CC
 * number, since DJs swap controllers.
 */

/** A MIDI note / button bound to a one-shot or momentary action. */
export type PadAction =
  | { kind: 'pad'; padIndex: number }
  | { kind: 'blackout' }
  | { kind: 'strobe' }
  | { kind: 'tap' }
  | { kind: 'resync' }
  | { kind: 'autopilot' }
  | { kind: 'manual' }

/** A continuous control bound to a MIDI knob/fader (Control Change). */
export type ControlAction =
  | { kind: 'masterDimmer' }
  | { kind: 'pan' }
  | { kind: 'tilt' }
  | { kind: 'speed' }
  | { kind: 'reactivity' }
  | { kind: 'colorPick' }

export type ControlKind = ControlAction['kind']

export interface MidiMapping {
  /** MIDI note number → pad/button action. */
  notes: Record<number, PadAction>
  /** MIDI CC number → continuous control (knob/fader). */
  controls: Record<number, ControlAction>
}

export function emptyMidiMapping(): MidiMapping {
  return { notes: {}, controls: {} }
}

/** True when a mapping has at least one bound note or control. */
export function midiMappingHasBindings(m: MidiMapping | undefined | null): boolean {
  if (!m) return false
  return Object.keys(m.notes).length > 0 || Object.keys(m.controls).length > 0
}
