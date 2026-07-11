import { AudioAnalyzer, type AnalyzerFrame } from '../../audio/AudioAnalyzer'
import { MidiPads } from '../../midi/MidiPads'

/**
 * Renderer-lifetime singletons shared by Perform and Setup panels: one
 * audio capture pipeline and one MIDI connection, regardless of which
 * panel is mounted.
 */
export const audioAnalyzer = new AudioAnalyzer()
export const midiPads = new MidiPads()

type FrameListener = (frame: AnalyzerFrame) => void
const frameListeners = new Set<FrameListener>()
const stateListeners = new Set<(running: boolean) => void>()

/** Subscribe to analyzer frames (e.g. Setup's meters). Returns unsubscribe. */
export function onAudioFrame(listener: FrameListener): () => void {
  frameListeners.add(listener)
  return () => frameListeners.delete(listener)
}

/** Subscribe to listening on/off changes. Returns unsubscribe. */
export function onAudioStateChange(listener: (running: boolean) => void): () => void {
  stateListeners.add(listener)
  return () => stateListeners.delete(listener)
}

function notifyState(running: boolean): void {
  for (const listener of stateListeners) listener(running)
}

/**
 * Single entry point for audio capture: frames always stream to the
 * lighting engine over IPC, plus any UI subscribers. Every caller
 * (auto-listen at launch, Perform's toggle, Setup's Listen button) goes
 * through here so they can't fight each other.
 */
export async function startAudioListening(deviceId: string): Promise<void> {
  await audioAnalyzer.start(deviceId, (frame) => {
    window.djCompanion.lighting.sendAudioFeatures(frame)
    for (const listener of frameListeners) listener(frame)
  })
  notifyState(true)
}

export async function stopAudioListening(): Promise<void> {
  await audioAnalyzer.stop()
  notifyState(false)
}

let autoListenAttempted = false

/** Starts capture from the saved device once per app session, if enabled. */
export async function autoStartAudioIfConfigured(settings: {
  deviceId: string | null
  autoListen: boolean
}): Promise<void> {
  if (autoListenAttempted || !settings.autoListen || !settings.deviceId) return
  autoListenAttempted = true
  try {
    await startAudioListening(settings.deviceId)
  } catch {
    // Device unplugged/renamed - user can re-pick it in Setup.
  }
}
