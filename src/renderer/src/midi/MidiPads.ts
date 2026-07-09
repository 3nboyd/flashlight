/**
 * MIDI pad-controller support via Web MIDI (no native deps). Note-on
 * messages trigger mapped actions; a "learn" mode captures the next note
 * and binds it. Mappings persist in localStorage keyed by note number —
 * they're device-agnostic on purpose, since DJs swap controllers.
 */

export type PadAction =
  | { kind: 'pad'; padIndex: number }
  | { kind: 'blackout' }
  | { kind: 'strobe' }
  | { kind: 'tap' }
  | { kind: 'resync' }
  | { kind: 'autopilot' }

export interface MidiMapping {
  /** MIDI note number → action. */
  notes: Record<number, PadAction>
}

const STORAGE_KEY = 'djc-midi-mapping'

export function loadMidiMapping(): MidiMapping {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as MidiMapping
  } catch {
    // fall through to default
  }
  return { notes: {} }
}

export function saveMidiMapping(mapping: MidiMapping): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping))
}

export interface MidiEvents {
  onAction: (action: PadAction, velocity: number, isNoteOn: boolean) => void
  /** Fired for every note-on when learn mode is armed, instead of onAction. */
  onLearn?: (note: number) => void
  onDevicesChanged?: (names: string[]) => void
}

export class MidiPads {
  private access: MIDIAccess | null = null
  private mapping: MidiMapping = loadMidiMapping()
  private learnArmed = false
  private learnCallback: ((note: number) => void) | null = null
  private events: MidiEvents | null = null

  async start(events: MidiEvents): Promise<boolean> {
    this.events = events
    if (!navigator.requestMIDIAccess) return false
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false })
    } catch {
      return false
    }
    const attach = (): void => {
      if (!this.access) return
      for (const input of this.access.inputs.values()) {
        input.onmidimessage = (msg) => this.handleMessage(msg)
      }
      this.events?.onDevicesChanged?.(
        [...this.access.inputs.values()].map((i) => i.name ?? 'MIDI device')
      )
    }
    this.access.onstatechange = attach
    attach()
    return true
  }

  private handleMessage(msg: MIDIMessageEvent): void {
    const data = msg.data
    if (!data || data.length < 3) return
    const status = data[0] & 0xf0
    const note = data[1]
    const velocity = data[2]
    const isNoteOn = status === 0x90 && velocity > 0
    const isNoteOff = status === 0x80 || (status === 0x90 && velocity === 0)
    if (!isNoteOn && !isNoteOff) return

    if (this.learnArmed && isNoteOn) {
      this.learnArmed = false
      const callback = this.learnCallback
      this.learnCallback = null
      if (callback) callback(note)
      else this.events?.onLearn?.(note)
      return
    }

    const action = this.mapping.notes[note]
    if (action) {
      this.events?.onAction(action, velocity, isNoteOn)
    }
  }

  armLearn(): void {
    this.learnArmed = true
  }

  /**
   * One-shot learn that doesn't disturb the active event handlers: the next
   * note-on is captured by `callback` instead of triggering its mapping.
   */
  learnOnce(callback: (note: number) => void): void {
    this.learnCallback = callback
    this.learnArmed = true
  }

  cancelLearn(): void {
    this.learnArmed = false
    this.learnCallback = null
  }

  bind(note: number, action: PadAction): void {
    this.mapping.notes[note] = action
    saveMidiMapping(this.mapping)
  }

  unbindAll(): void {
    this.mapping = { notes: {} }
    saveMidiMapping(this.mapping)
  }

  getMapping(): MidiMapping {
    return this.mapping
  }

  isStarted(): boolean {
    return this.access !== null
  }

  deviceNames(): string[] {
    if (!this.access) return []
    return [...this.access.inputs.values()].map((i) => i.name ?? 'MIDI device')
  }
}
