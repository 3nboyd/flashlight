/**
 * MIDI pad-controller support via Web MIDI (no native deps). Note-on
 * messages trigger mapped actions; a "learn" mode captures the next note
 * and binds it. The durable mapping lives in the LightingProject (saved to
 * disk); localStorage is kept only as a legacy cache + migration source.
 * Mappings are device-agnostic on purpose, since DJs swap controllers.
 */

import type { PadAction, ControlAction, ControlKind, MidiMapping } from '@core/lighting/midi/midiMapping'

export type { PadAction, ControlAction, ControlKind, MidiMapping }

const STORAGE_KEY = 'djc-midi-mapping'

/** Legacy localStorage mapping, used only to migrate into the project once. */
export function loadMidiMapping(): MidiMapping {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MidiMapping>
      return { notes: parsed.notes ?? {}, controls: parsed.controls ?? {} }
    }
  } catch {
    // fall through to default
  }
  return { notes: {}, controls: {} }
}

export function saveMidiMapping(mapping: MidiMapping): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping))
}

export interface MidiEvents {
  onAction: (action: PadAction, velocity: number, isNoteOn: boolean) => void
  /** Fired for a mapped knob/fader (Control Change), value 0-127. */
  onControl?: (action: ControlAction, value: number) => void
  /** Fired for every note-on when learn mode is armed, instead of onAction. */
  onLearn?: (note: number) => void
  onDevicesChanged?: (names: string[]) => void
}

export class MidiPads {
  private access: MIDIAccess | null = null
  private mapping: MidiMapping = loadMidiMapping()
  private learnArmed = false
  private learnCallback: ((note: number) => void) | null = null
  private learnControlArmed = false
  private learnControlCallback: ((cc: number) => void) | null = null
  private events: MidiEvents | null = null
  private onChange: ((mapping: MidiMapping) => void) | null = null
  // Raw note taps, independent of the lighting action mapping - used by the
  // camera view for its own note bindings without clobbering `events`.
  private noteListeners = new Set<(note: number, velocity: number, isNoteOn: boolean) => void>()

  /** Subscribe to every note on/off (not consumed by learn). Returns an
   *  unsubscribe fn. Fires regardless of the lighting mapping. */
  addNoteListener(fn: (note: number, velocity: number, isNoteOn: boolean) => void): () => void {
    this.noteListeners.add(fn)
    return () => this.noteListeners.delete(fn)
  }

  /** Register a persistence sink (the store writes the mapping into the
   *  project). Fired whenever a binding changes, not on setMapping(). */
  setOnChange(cb: ((mapping: MidiMapping) => void) | null): void {
    this.onChange = cb
  }

  /** Replace the active mapping (e.g. loaded from the project / stage switch)
   *  without firing onChange, so loading never loops back into a save. */
  setMapping(mapping: MidiMapping): void {
    this.mapping = { notes: { ...mapping.notes }, controls: { ...mapping.controls } }
  }

  /** Cache to localStorage and notify the persistence sink. */
  private persist(): void {
    saveMidiMapping(this.mapping)
    this.onChange?.({ notes: { ...this.mapping.notes }, controls: { ...this.mapping.controls } })
  }

  private attachInputs(): void {
    if (!this.access) return
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (msg) => this.handleMessage(msg)
    }
    this.events?.onDevicesChanged?.(
      [...this.access.inputs.values()].map((i) => i.name ?? 'MIDI device')
    )
  }

  private async acquire(): Promise<boolean> {
    if (this.access) return true
    if (!navigator.requestMIDIAccess) return false
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false })
    } catch {
      return false
    }
    this.access.onstatechange = () => this.attachInputs()
    this.attachInputs()
    return true
  }

  async start(events: MidiEvents): Promise<boolean> {
    this.events = events
    const ok = await this.acquire()
    if (ok) this.attachInputs()
    return ok
  }

  /** Begin listening without registering lighting event handlers, so other
   *  views (camera) can use note taps + learn even when no lighting panel is
   *  mounted. Never clears an existing `events`. */
  async ensureStarted(): Promise<boolean> {
    return this.acquire()
  }

  private handleMessage(msg: MIDIMessageEvent): void {
    const data = msg.data
    if (!data || data.length < 3) return
    const status = data[0] & 0xf0

    // Control Change: knobs and faders.
    if (status === 0xb0) {
      const cc = data[1]
      const value = data[2]
      if (this.learnControlArmed) {
        this.learnControlArmed = false
        const callback = this.learnControlCallback
        this.learnControlCallback = null
        callback?.(cc)
        return
      }
      const action = this.mapping.controls[cc]
      if (action) this.events?.onControl?.(action, value)
      return
    }

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

    // Raw taps (camera bindings etc.) see every note, independent of mapping.
    this.noteListeners.forEach((fn) => fn(note, velocity, isNoteOn))

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

  /** One-shot learn for a knob/fader: the next Control Change is captured. */
  learnControlOnce(callback: (cc: number) => void): void {
    this.learnControlCallback = callback
    this.learnControlArmed = true
  }

  cancelLearn(): void {
    this.learnArmed = false
    this.learnCallback = null
    this.learnControlArmed = false
    this.learnControlCallback = null
  }

  bind(note: number, action: PadAction): void {
    this.mapping.notes[note] = action
    this.persist()
  }

  unbindNote(note: number): void {
    delete this.mapping.notes[note]
    this.persist()
  }

  bindControl(cc: number, action: ControlAction): void {
    this.mapping.controls[cc] = action
    this.persist()
  }

  unbindControl(cc: number): void {
    delete this.mapping.controls[cc]
    this.persist()
  }

  unbindAll(): void {
    this.mapping = { notes: {}, controls: {} }
    this.persist()
  }

  getMapping(): MidiMapping {
    return this.mapping
  }

  isStarted(): boolean {
    return this.access !== null
  }

  /** Stop firing lighting pad/control actions from this window without dropping
   *  the MIDI connection or note listeners. Used when the Lighting pane is
   *  popped out to another window, which becomes the sole pad authority; the
   *  next `start()` (when the pane returns) re-registers the handlers. */
  suspendActions(): void {
    this.events = null
  }

  deviceNames(): string[] {
    if (!this.access) return []
    return [...this.access.inputs.values()].map((i) => i.name ?? 'MIDI device')
  }
}
