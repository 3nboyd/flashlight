/**
 * Deterministic beat detection: spectral-flux onset detection with an
 * adaptive threshold, plus BPM estimation by autocorrelating the onset
 * envelope. Pure math over numeric arrays — no Web Audio types — so the
 * whole thing is unit-testable in Node; the renderer feeds it magnitude
 * spectra from an AnalyserNode at a steady frame rate.
 */

export interface OnsetFrame {
  flux: number
  isOnset: boolean
}

export class SpectralFluxOnsetDetector {
  private previousSpectrum: Float32Array | null = null
  private readonly fluxHistory: number[] = []
  private readonly historyLength: number
  private readonly sensitivity: number
  private framesSinceOnset = Infinity
  private readonly minFramesBetweenOnsets: number

  constructor(options?: {
    /** Frames of flux history for the adaptive threshold (~1s worth). */
    historyLength?: number
    /** Threshold = mean(history) * sensitivity. Higher = fewer onsets. */
    sensitivity?: number
    /** Refractory period so one kick doesn't fire twice (~100ms worth). */
    minFramesBetweenOnsets?: number
  }) {
    this.historyLength = options?.historyLength ?? 43
    this.sensitivity = options?.sensitivity ?? 1.5
    this.minFramesBetweenOnsets = options?.minFramesBetweenOnsets ?? 4
  }

  /** Feed one magnitude spectrum frame; returns flux and onset decision. */
  process(spectrum: Float32Array): OnsetFrame {
    let flux = 0
    if (this.previousSpectrum && this.previousSpectrum.length === spectrum.length) {
      for (let i = 0; i < spectrum.length; i++) {
        const diff = spectrum[i] - this.previousSpectrum[i]
        if (diff > 0) flux += diff // half-wave rectified: only energy increases
      }
    }
    this.previousSpectrum = Float32Array.from(spectrum)

    const mean =
      this.fluxHistory.length > 0
        ? this.fluxHistory.reduce((a, b) => a + b, 0) / this.fluxHistory.length
        : 0
    const threshold = mean * this.sensitivity

    this.fluxHistory.push(flux)
    if (this.fluxHistory.length > this.historyLength) this.fluxHistory.shift()

    this.framesSinceOnset += 1
    const isOnset =
      this.fluxHistory.length >= 8 &&
      flux > threshold &&
      flux > 0 &&
      this.framesSinceOnset >= this.minFramesBetweenOnsets
    if (isOnset) this.framesSinceOnset = 0

    return { flux, isOnset }
  }
}

/**
 * Estimates BPM by autocorrelating a recent window of the onset-flux
 * envelope. Returns null until there is enough history or when no
 * periodicity stands out (e.g. ambient passages), so callers can hold the
 * previous stable tempo instead of jittering.
 */
export class BpmEstimator {
  private readonly envelope: number[] = []
  private readonly framesPerSecond: number
  private readonly windowSeconds: number

  constructor(framesPerSecond: number, windowSeconds = 8) {
    this.framesPerSecond = framesPerSecond
    this.windowSeconds = windowSeconds
  }

  addFrame(flux: number): void {
    this.envelope.push(flux)
    const maxFrames = Math.round(this.framesPerSecond * this.windowSeconds)
    while (this.envelope.length > maxFrames) this.envelope.shift()
  }

  estimate(): number | null {
    const minFrames = Math.round(this.framesPerSecond * 4)
    if (this.envelope.length < minFrames) return null

    const signal = this.envelope
    const n = signal.length
    const mean = signal.reduce((a, b) => a + b, 0) / n
    const centered = signal.map((v) => v - mean)

    // Search lags covering 60-180 BPM.
    const minLag = Math.max(2, Math.floor((this.framesPerSecond * 60) / 180))
    const maxLag = Math.min(n - 2, Math.ceil((this.framesPerSecond * 60) / 60))

    let bestLag = 0
    let bestScore = 0
    let energy = 0
    for (const v of centered) energy += v * v
    if (energy === 0) return null

    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0
      for (let i = 0; i + lag < n; i++) {
        sum += centered[i] * centered[i + lag]
      }
      const score = sum / energy
      if (score > bestScore) {
        bestScore = score
        bestLag = lag
      }
    }

    if (bestLag === 0 || bestScore < 0.1) return null

    let bpm = (60 * this.framesPerSecond) / bestLag
    // Fold octave errors into the DJ-typical 70-180 range.
    while (bpm < 70) bpm *= 2
    while (bpm > 180) bpm /= 2
    return Math.round(bpm * 10) / 10
  }
}
