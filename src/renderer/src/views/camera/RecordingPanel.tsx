import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Recorder, supportedVideoFormats, type RecordFormat } from '../../camera/Recorder'

const FOLDER_KEY = 'djc.rec.folder'
const FORMAT_KEY = 'djc.rec.format'
const AUDIO_KEY = 'djc.rec.audio'
const AUDIODEV_KEY = 'djc.rec.audioDevice'
const SEPARATE_KEY = 'djc.rec.separate'
const OUTPUT_KEY = 'djc.rec.output'
const QUALITY_KEY = 'djc.rec.quality'

type OutputFormat = 'mp4' | 'mov' | 'webm'
type Quality = 'high' | 'balanced' | 'small'
const OUTPUT_LABELS: Record<OutputFormat, string> = {
  mp4: 'MP4 (H.264) - recommended',
  mov: 'MOV (H.264)',
  webm: 'WebM (as recorded, no convert)'
}
const QUALITY_LABELS: Record<Quality, string> = {
  high: 'High',
  balanced: 'Balanced',
  small: 'Small file'
}

/** The recorded WebM name -> the final output name for the chosen container. */
function outputName(recordedName: string, output: OutputFormat): string {
  const base = recordedName.replace(/\.[^.]+$/, '')
  if (output === 'webm') return `${base}.webm`
  // Audio-only sidecar files become .m4a; video (or muxed) become the container.
  if (/-audio$/.test(base)) return `${base}.m4a`
  return `${base}.${output}`
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(m)}:${p(s % 60)}`
}

/** A tiny live level meter for the selected audio input (5 bars). */
function AudioMeter({ deviceId, active }: { deviceId: string | null; active: boolean }): JSX.Element {
  const barsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active) return
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let raf = 0
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stream = s
        ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 128
        ctx.createMediaStreamSource(s).connect(analyser)
        const data = new Uint8Array(analyser.frequencyBinCount)
        const BANDS = 5
        const band = Math.floor(data.length / BANDS)
        const tick = (): void => {
          raf = requestAnimationFrame(tick)
          analyser.getByteFrequencyData(data)
          const bars = barsRef.current?.children
          if (!bars) return
          for (let i = 0; i < BANDS; i++) {
            let sum = 0
            for (let j = 0; j < band; j++) sum += data[i * band + j]
            const v = Math.min(1, sum / band / 170)
            ;(bars[i] as HTMLElement).style.height = `${12 + v * 88}%`
          }
        }
        tick()
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      ctx?.close().catch(() => undefined)
    }
  }, [deviceId, active])
  return (
    <div className="rec-eq" ref={barsRef} title="Audio input level">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className="rec-eq-bar" />
      ))}
    </div>
  )
}

/**
 * Records the live program to disk. A compact bar (Record + timer + input level
 * + input picker) keeps the common controls one row; everything else lives
 * behind the settings gear.
 */
export function RecordingPanel({
  getCanvas
}: {
  getCanvas: () => HTMLCanvasElement | null
}): JSX.Element {
  const formats = useMemo(() => supportedVideoFormats(), [])
  const [folder, setFolder] = useState<string | null>(() => localStorage.getItem(FOLDER_KEY))
  const [formatMime, setFormatMime] = useState<string>(
    () => localStorage.getItem(FORMAT_KEY) ?? formats[0]?.mimeType ?? ''
  )
  const [includeAudio, setIncludeAudio] = useState(() => localStorage.getItem(AUDIO_KEY) === '1')
  const [separate, setSeparate] = useState(() => localStorage.getItem(SEPARATE_KEY) === '1')
  const [audioDevice, setAudioDevice] = useState<string | null>(() => localStorage.getItem(AUDIODEV_KEY))
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])

  const [output, setOutput] = useState<OutputFormat>(
    () => (localStorage.getItem(OUTPUT_KEY) as OutputFormat) ?? 'mp4'
  )
  const [quality, setQuality] = useState<Quality>(
    () => (localStorage.getItem(QUALITY_KEY) as Quality) ?? 'balanced'
  )

  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [converting, setConverting] = useState(false)
  const [saved, setSaved] = useState<string[]>([])
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const recorderRef = useRef(new Recorder())

  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((list) => setAudioInputs(list.filter((d) => d.kind === 'audioinput')))
      .catch(() => undefined)
  }, [includeAudio])

  // Tick the elapsed clock while recording.
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => setElapsed(recorderRef.current.elapsedMs), 250)
    return () => clearInterval(id)
  }, [recording])

  const chooseFolder = async (): Promise<void> => {
    const dir = await window.djCompanion.dialog.selectFolder()
    if (dir) {
      setFolder(dir)
      localStorage.setItem(FOLDER_KEY, dir)
    }
  }

  const start = async (): Promise<void> => {
    setError('')
    const canvas = getCanvas()
    if (!canvas) {
      setError('No program to record. Enable a camera (the auto-director/selected camera is recorded).')
      return
    }
    if (!folder) {
      setError('Choose an output folder first.')
      return
    }
    const format = formats.find((f) => f.mimeType === formatMime) ?? formats[0]
    if (!format) {
      setError('No supported recording format in this build.')
      return
    }
    try {
      await recorderRef.current.start(canvas, {
        format,
        fps: 30,
        includeAudio,
        audioDeviceId: audioDevice,
        separate
      })
      setSaved([])
      setRecording(true)
    } catch (err) {
      setError(`Could not start recording: ${(err as Error)?.message ?? err}`)
    }
  }

  const stop = async (): Promise<void> => {
    try {
      const files = await recorderRef.current.stop()
      setRecording(false)
      if (output !== 'webm') setConverting(true)
      const paths: string[] = []
      for (const f of files) {
        // Convert transcodes to MP4/MOV via FFmpeg in the main process; WebM is
        // written straight through.
        const path = await window.djCompanion.recording.convert(
          folder!,
          outputName(f.name, output),
          f.buffer,
          quality
        )
        paths.push(path)
      }
      setConverting(false)
      setSaved(paths)
    } catch (err) {
      setRecording(false)
      setConverting(false)
      setError(`Could not save recording: ${(err as Error)?.message ?? err}`)
    }
  }

  const setFormat = (mime: string): void => {
    setFormatMime(mime)
    localStorage.setItem(FORMAT_KEY, mime)
  }

  const folderLabel = folder ? folder.split('/').pop() || folder : 'No folder chosen'
  const audioSelectValue = !includeAudio ? 'off' : (audioDevice ?? 'default')
  const setAudioSelect = (v: string): void => {
    if (v === 'off') {
      setIncludeAudio(false)
      localStorage.setItem(AUDIO_KEY, '0')
      return
    }
    setIncludeAudio(true)
    localStorage.setItem(AUDIO_KEY, '1')
    if (v === 'default') {
      setAudioDevice(null)
      localStorage.removeItem(AUDIODEV_KEY)
    } else {
      setAudioDevice(v)
      localStorage.setItem(AUDIODEV_KEY, v)
    }
  }

  if (formats.length === 0) {
    return <p className="settings-hint">Recording is not supported in this build.</p>
  }

  return (
    <div className="cam-rec">
      <div className="rec-bar">
        <button
          className={`cam-rec-btn${recording ? ' recording' : ''}`}
          onClick={recording ? stop : start}
          disabled={converting}
        >
          {converting ? 'Converting…' : recording ? '■ Stop' : '● Record'}
        </button>
        <span className={`rec-timer${recording ? ' on' : ''}`}>{fmtElapsed(elapsed)}</span>
        <AudioMeter deviceId={audioDevice} active={includeAudio} />
        <select
          className="rec-audio-select"
          value={audioSelectValue}
          disabled={recording}
          title="Audio input to record"
          onChange={(e) => setAudioSelect(e.target.value)}
        >
          <option value="off">No audio</option>
          <option value="default">Default input</option>
          {audioInputs.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Input ${i + 1}`}
            </option>
          ))}
        </select>
        <button
          className={`cam-icon-btn${settingsOpen ? ' active' : ''}`}
          title="Recording settings (folder, format, quality)"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          ⚙
        </button>
      </div>

      {settingsOpen && (
        <div className="rec-settings">
          <button className="cam-output-btn" onClick={chooseFolder} title={folder ?? ''}>
            Folder: {folderLabel}
          </button>
          <label className="cam-rec-field">
            <span>Output</span>
            <select
              value={output}
              disabled={recording || converting}
              onChange={(e) => {
                const v = e.target.value as OutputFormat
                setOutput(v)
                localStorage.setItem(OUTPUT_KEY, v)
              }}
            >
              {(Object.keys(OUTPUT_LABELS) as OutputFormat[]).map((o) => (
                <option key={o} value={o}>
                  {OUTPUT_LABELS[o]}
                </option>
              ))}
            </select>
          </label>
          {output !== 'webm' && (
            <label className="cam-rec-field">
              <span>Quality</span>
              <select
                value={quality}
                disabled={recording || converting}
                onChange={(e) => {
                  const v = e.target.value as Quality
                  setQuality(v)
                  localStorage.setItem(QUALITY_KEY, v)
                }}
              >
                {(Object.keys(QUALITY_LABELS) as Quality[]).map((q) => (
                  <option key={q} value={q}>
                    {QUALITY_LABELS[q]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="cam-rec-field">
            <span>Codec</span>
            <select value={formatMime} onChange={(e) => setFormat(e.target.value)} disabled={recording || converting}>
              {formats.map((f: RecordFormat) => (
                <option key={f.mimeType} value={f.mimeType}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          {includeAudio && (
            <label className="cam-rec-check">
              <input
                type="checkbox"
                checked={separate}
                disabled={recording}
                onChange={(e) => {
                  setSeparate(e.target.checked)
                  localStorage.setItem(SEPARATE_KEY, e.target.checked ? '1' : '0')
                }}
              />
              Separate audio + video files
            </label>
          )}
        </div>
      )}

      {saved.length > 0 && (
        <div className="cam-rec-saved">
          {saved.map((p) => (
            <button key={p} className="cam-rec-saved-link" onClick={() => window.djCompanion.recording.reveal(p)}>
              Saved: {p.split('/').pop()}
            </button>
          ))}
        </div>
      )}
      {error && <p className="settings-hint">{error}</p>}
    </div>
  )
}
