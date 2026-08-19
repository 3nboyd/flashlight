/**
 * Records the live visual canvas (and optionally audio) to file(s) using the
 * browser MediaRecorder. Instead of buffering the whole take in memory, each
 * ~1s chunk is STREAMED to the main process and appended straight to disk. This
 * keeps renderer memory flat no matter how long the recording runs (hours), and
 * means a crash only ever loses the last moment - essential for long sets. WebM
 * chunks concatenate into one valid file; MP4 conversion is done afterwards.
 */

export interface RecordFormat {
  label: string
  mimeType: string
  ext: string
}

/** Video container/codec options, filtered to what this build actually supports.
 *  WebM is listed first: it streams to disk as one valid, concatenable file, so
 *  it's the safe choice for long recordings (MP4 is a post-set conversion). */
const VIDEO_CANDIDATES: RecordFormat[] = [
  { label: 'WebM (VP9) — recommended for long sets', mimeType: 'video/webm;codecs=vp9,opus', ext: 'webm' },
  { label: 'WebM (VP8)', mimeType: 'video/webm;codecs=vp8,opus', ext: 'webm' },
  { label: 'WebM', mimeType: 'video/webm', ext: 'webm' },
  { label: 'MP4 (H.264)', mimeType: 'video/mp4;codecs=h264,aac', ext: 'mp4' },
  { label: 'MP4', mimeType: 'video/mp4', ext: 'mp4' }
]

const AUDIO_CANDIDATES: RecordFormat[] = [
  { label: 'WebM (Opus)', mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
  { label: 'M4A (AAC)', mimeType: 'audio/mp4', ext: 'm4a' },
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
  /** Folder the file(s) stream into. */
  folder: string
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

interface Track {
  rec: MediaRecorder
  streamId: number
  path: string
  /** Serializes chunk writes so bytes land on disk in order. */
  writeChain: Promise<void>
}

export class Recorder {
  private tracks: Track[] = []
  private videoStream: MediaStream | null = null
  private audioStream: MediaStream | null = null
  private startedAt = 0

  get recording(): boolean {
    return this.tracks.length > 0
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
    this.tracks = []

    const startOne = async (stream: MediaStream, mimeType: string, filename: string): Promise<void> => {
      const { id, path } = await window.djCompanion.recording.openStream(opts.folder, filename)
      const rec = new MediaRecorder(stream, { mimeType })
      const track: Track = { rec, streamId: id, path, writeChain: Promise.resolve() }
      rec.ondataavailable = (e): void => {
        if (!e.data || e.data.size === 0) return
        // Chain each write so chunks reach disk in order; the Blob is held only
        // until its bytes are flushed, so memory stays flat.
        track.writeChain = track.writeChain
          .then(() => e.data.arrayBuffer())
          .then((buf) => {
            void window.djCompanion.recording.writeChunk(id, buf)
          })
          .catch(() => undefined)
      }
      rec.start(1000) // flush a chunk to disk about once per second
      this.tracks.push(track)
    }

    if (opts.includeAudio && opts.separate && audioTracks.length > 0) {
      await startOne(new MediaStream(videoStream.getVideoTracks()), opts.format.mimeType, `${base}.${opts.format.ext}`)
      const af = pickAudioFormat()
      if (af) await startOne(new MediaStream(audioTracks), af.mimeType, `${base}-audio.${af.ext}`)
    } else {
      const combined = new MediaStream([...videoStream.getVideoTracks(), ...audioTracks])
      await startOne(combined, opts.format.mimeType, `${base}.${opts.format.ext}`)
    }
    this.startedAt = Date.now()
  }

  /** Stop, flush every pending chunk to disk, close the files. Returns paths. */
  async stop(): Promise<string[]> {
    if (!this.recording) return []
    const tracks = this.tracks
    await Promise.all(
      tracks.map(
        (t) =>
          new Promise<void>((resolve) => {
            t.rec.onstop = (): void => resolve()
            t.rec.stop()
          })
      )
    )
    this.videoStream?.getTracks().forEach((t) => t.stop())
    this.audioStream?.getTracks().forEach((t) => t.stop())

    const paths: string[] = []
    for (const t of tracks) {
      await t.writeChain // ensure the final chunk is written before closing
      const p = await window.djCompanion.recording.closeStream(t.streamId)
      paths.push(p ?? t.path)
    }
    this.tracks = []
    this.videoStream = null
    this.audioStream = null
    return paths
  }
}
