import { AudioAnalyzer } from '../../audio/AudioAnalyzer'
import { MidiPads } from '../../midi/MidiPads'

/**
 * Renderer-lifetime singletons shared by Perform and Setup panels: one
 * audio capture pipeline and one MIDI connection, regardless of which
 * panel is mounted.
 */
export const audioAnalyzer = new AudioAnalyzer()
export const midiPads = new MidiPads()
