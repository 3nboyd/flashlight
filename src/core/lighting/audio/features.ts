/**
 * Audio features streamed from the renderer's Web Audio analyzer to the
 * lighting engine (~40 fps). The renderer computes these from the virtual
 * audio cable / input device carrying the DJ software's master output.
 * All values are normalized 0-1.
 */
export interface AudioFeatures {
  /** Overall loudness (RMS). */
  rms: number
  /** Energy in the kick/bass band (~20-150 Hz). */
  bass: number
  /** Energy in the mid band (~150-2000 Hz). */
  mid: number
  /** Energy in the high band (~2-16 kHz). */
  high: number
  /** True on frames where an onset (transient/kick) was detected. */
  onset: boolean
  /** Milliseconds timestamp (performance.now() in the renderer). */
  timestampMs: number
}

export const SILENT_FEATURES: AudioFeatures = {
  rms: 0,
  bass: 0,
  mid: 0,
  high: 0,
  onset: false,
  timestampMs: 0
}
