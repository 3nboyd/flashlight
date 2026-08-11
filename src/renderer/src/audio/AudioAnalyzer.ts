import { SpectralFluxOnsetDetector } from '@core/lighting/audio/BeatDetector'

export interface AnalyzerFrame {
  rms: number
  bass: number
  mid: number
  high: number
  onset: boolean
  flux: number
  timestampMs: number
}

/**
 * Captures an audio input device (typically a virtual audio cable carrying
 * the DJ software's master output) and derives normalized features at
 * ~40fps via Web Audio. Features are handed to a callback which forwards
 * them to the main-process lighting engine over IPC.
 */
export class AudioAnalyzer {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private timerId: ReturnType<typeof setInterval> | null = null
  private readonly onsetDetector = new SpectralFluxOnsetDetector()

  static async listInputDevices(): Promise<MediaDeviceInfo[]> {
    // Prompt once so device labels become visible, then enumerate.
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
      probe.getTracks().forEach((t) => t.stop())
    } catch {
      // Denied/no device: enumerate anyway; labels may be blank.
    }
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === 'audioinput')
  }

  async start(deviceId: string, onFrame: (frame: AnalyzerFrame) => void): Promise<void> {
    await this.stop()

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    })
    this.context = new AudioContext()
    const source = this.context.createMediaStreamSource(this.stream)
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.4
    source.connect(this.analyser)

    const freqBins = new Float32Array(this.analyser.frequencyBinCount)
    const timeDomain = new Float32Array(this.analyser.fftSize)
    const sampleRate = this.context.sampleRate
    const binHz = sampleRate / this.analyser.fftSize
    const bassEnd = Math.round(150 / binHz)
    const midEnd = Math.round(2000 / binHz)
    const highEnd = Math.min(freqBins.length, Math.round(16000 / binHz))

    const tick = (): void => {
      const analyser = this.analyser
      if (!analyser) return
      const now = performance.now()
      // The AudioContext can be suspended when the window is backgrounded on
      // some platforms; keep it running so analysis never stalls.
      if (this.context && this.context.state === 'suspended') void this.context.resume()
      analyser.getFloatFrequencyData(freqBins)
      analyser.getFloatTimeDomainData(timeDomain)

      // dB (-100..0) → 0-1 linear-ish magnitude per bin.
      const magnitude = new Float32Array(freqBins.length)
      for (let i = 0; i < freqBins.length; i++) {
        magnitude[i] = Math.max(0, (freqBins[i] + 100) / 100)
      }

      const bandAvg = (from: number, to: number): number => {
        let sum = 0
        const count = Math.max(1, to - from)
        for (let i = from; i < to; i++) sum += magnitude[i]
        return sum / count
      }

      let sumSquares = 0
      for (let i = 0; i < timeDomain.length; i++) sumSquares += timeDomain[i] * timeDomain[i]
      const rms = Math.min(1, Math.sqrt(sumSquares / timeDomain.length) * 4)

      const onsetResult = this.onsetDetector.process(magnitude.subarray(0, midEnd))

      onFrame({
        rms,
        // Rescale band averages: the dB floor mapping leaves usable signal ~0.3-0.9.
        bass: Math.min(1, Math.max(0, (bandAvg(1, bassEnd) - 0.25) * 1.8)),
        mid: Math.min(1, Math.max(0, (bandAvg(bassEnd, midEnd) - 0.25) * 1.8)),
        high: Math.min(1, Math.max(0, (bandAvg(midEnd, highEnd) - 0.25) * 1.8)),
        onset: onsetResult.isOnset,
        flux: onsetResult.flux,
        timestampMs: now
      })
    }
    // Driven by a timer, NOT requestAnimationFrame: rAF pauses whenever the
    // window is hidden/occluded, which stalled audio (and cut the lights) the
    // moment the DJ looked away. With backgroundThrottling disabled, this keeps
    // firing at ~40fps regardless of focus/visibility.
    this.timerId = setInterval(tick, 24)
  }

  async stop(): Promise<void> {
    if (this.timerId !== null) {
      clearInterval(this.timerId)
      this.timerId = null
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    if (this.context) {
      await this.context.close().catch(() => undefined)
      this.context = null
    }
    this.analyser = null
  }

  isRunning(): boolean {
    return this.timerId !== null
  }
}
