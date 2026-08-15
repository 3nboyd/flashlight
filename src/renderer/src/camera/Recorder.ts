/**
 * Records the live visual canvas (and optionally audio) to file(s) using the
 * browser MediaRecorder. Can mux audio+video into one file, or capture them as
 * two separate files. The encoded bytes are handed to the main process to write
 * to the user's chosen folder.
 */

export interface RecordFormat {
  label: string
  mimeType: string
  ext: string
}

/** Video container/codec options, filtered to what this build actually supports. */
const VIDEO_CANDIDATES: RecordFormat[] = [
  { label: 'MP4 (H.264)', mimeType: 'video/mp4;codecs=h264,aac', ext: 'mp4' },
  { label: 'MP4', mimeType: 'video/mp4', ext: 'mp4' },
  { label: 'WebM (VP9)', mimeType: 'video/webm;codecs=vp9,opus', ext: 'webm' },
  { label: 'WebM (VP8)', mimeType: 'video/webm;codecs=vp8,opus', ext: 'webm' },
  { label: 'WebM', mimeType: 'video/webm', ext: 'webm' }
]

const AUDIO_CANDIDATES: RecordFormat[] = [
  { label: 'M4A (AAC)', mimeType: 'audio/mp4', ext: 'm4a' },
  { label: 'WebM (Opus)', mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
  { label: 'WebM', mimeType: 'audio/webm', ext: 'webm' }
]

function supported(list: RecordFormat[]): RecordFormat[] {
  if (typeof MediaRecorder === 'undefined') return []
  return list.filter((c) => MediaRecorder.isTypeSupported(c.mimeType))
}

export function supportedVideoFormats(): RecordFormat[] {
  return supported(VIDEO_CANDIDATES)
}

function pickAudioFormat(): RecordFormat | null {
  return supported(AUDIO_CANDIDATES)[0] ?? null
}

export interface RecordOptions {
  format: RecordFormat
  fps: number
  includeAudio: boolean
  audioDeviceId: string | null
  /** Write audio + video as two separate files instead of one muxed file. */
  separate: boolean
}

export interface RecordedFile {
  name: string
  buffer: ArrayBuffer
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export class Recorder {
  private recorders: MediaRecorder[] = []
  private chunks: Blob[][] = []
  private names: string[] = []
  private videoStream: MediaStream | null = null
  private audioStream: MediaStream | null = null
  private startedAt = 0

  get recording(): boolean {
    return this.recorders.length > 0
  }

  get elapsedMs(): number {
    return this.recording ? Date.now() - this.startedAt : 0
  }

  async start(canvas: HTMLCanvasElement, opts: RecordOptions): Promise<void> {
    if (this.recording) return
    const videoStream = canvas.captureStream(opts.fps)
    this.videoStream = videoStream

    let audioTracks: MediaStreamTrack[] = []
    if (opts.includeAudio) {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: opts.audioDeviceId ? { deviceId: { exact: opts.audioDeviceId } } : true
      })
      audioTracks = this.audioStream.getAudioTracks()
    }

    const base = `dj-${timestamp()}`
    this.recorders = []
    this.chunks = []
    this.names = []

    const startOne = (stream: MediaStream, mimeType: string, name: string): void => {
      const idx = this.recorders.length
      const rec = new MediaRecorder(stream, { mimeType })
      this.chunks[idx] = []
      rec.ondataavailable = (e): void => {
        if (e.data && e.data.size > 0) this.chunks[idx].push(e.data)
      }
      rec.start(1000) // flush in ~1s slices so long takes don't balloon in memory
      this.recorders.push(rec)
      this.names.push(name)
    }

    if (opts.includeAudio && opts.separate && audioTracks.length > 0) {
      startOne(new MediaStream(videoStream.getVideoTracks()), opts.format.mimeType, `${base}.${opts.format.ext}`)
      const af = pickAudioFormat()
      if (af) startOne(new MediaStream(audioTracks), af.mimeType, `${base}-audio.${af.ext}`)
    } else {
      const combined = new MediaStream([...videoStream.getVideoTracks(), ...audioTracks])
      startOne(combined, opts.format.mimeType, `${base}.${opts.format.ext}`)
    }
    this.startedAt = Date.now()
  }

  async stop(): Promise<RecordedFile[]> {
    if (!this.recording) return []
    const recs = this.recorders
    const names = this.names
    const blobs = await Promise.all(
      recs.map(
        (rec, idx) =>
          new Promise<Blob>((resolve) => {
            rec.onstop = (): void => resolve(new Blob(this.chunks[idx], { type: rec.mimeType }))
            rec.stop()
          })
      )
    )
    this.videoStream?.getTracks().forEach((t) => t.stop())
    this.audioStream?.getTracks().forEach((t) => t.stop())
    const files: RecordedFile[] = []
    for (let i = 0; i < blobs.length; i++) {
      files.push({ name: names[i], buffer: await blobs[i].arrayBuffer() })
    }
    this.recorders = []
    this.chunks = []
    this.names = []
    this.videoStream = null
    this.audioStream = null
    return files
  }
}
