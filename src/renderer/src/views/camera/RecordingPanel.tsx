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

/**
 * Records the primary camera visual to disk. Sits alongside the projector
 * output (the "background" use) as the "record" use of the same visual.
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

  return (
    <div className="cam-rec">
      <div className="cam-rec-row">
        <button className="cam-output-btn" onClick={chooseFolder} title={folder ?? ''}>
          Folder: {folderLabel}
        </button>
      </div>

      {formats.length === 0 ? (
        <p className="settings-hint">Recording is not supported in this build.</p>
      ) : (
        <>
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

          <label className="cam-rec-check">
            <input
              type="checkbox"
              checked={includeAudio}
              disabled={recording}
              onChange={(e) => {
                setIncludeAudio(e.target.checked)
                localStorage.setItem(AUDIO_KEY, e.target.checked ? '1' : '0')
              }}
            />
            Record audio
          </label>

          {includeAudio && (
            <label className="cam-rec-field">
              <span>Audio in</span>
              <select
                value={audioDevice ?? ''}
                disabled={recording}
                onChange={(e) => {
                  const v = e.target.value || null
                  setAudioDevice(v)
                  if (v) localStorage.setItem(AUDIODEV_KEY, v)
                  else localStorage.removeItem(AUDIODEV_KEY)
                }}
              >
                <option value="">Default input</option>
                {audioInputs.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Input ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}

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

          <button
            className={`cam-rec-btn${recording ? ' recording' : ''}`}
            onClick={recording ? stop : start}
            disabled={converting}
          >
            {converting
              ? 'Converting…'
              : recording
                ? `■ Stop (${fmtElapsed(elapsed)})`
                : '● Record'}
          </button>

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
        </>
      )}
    </div>
  )
}
