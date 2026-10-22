import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Recorder, supportedVideoFormats, type RecordFormat } from '../../camera/Recorder'

const FOLDER_KEY = 'djc.rec.folder'
const FORMAT_KEY = 'djc.rec.format'
const AUDIO_KEY = 'djc.rec.audio'
const AUDIODEV_KEY = 'djc.rec.audioDevice'
const SEPARATE_KEY = 'djc.rec.separate'
const OUTPUT_KEY = 'djc.rec.output'
const QUALITY_KEY = 'djc.rec.quality'
const MAXH_KEY = 'djc.rec.maxHeight' // record height cap: 0 = source, 720, 1080
const FPS_KEY = 'djc.rec.fps'
const AUDIO_DELAY_KEY = 'djc.rec.audioDelay'

type OutputFormat = 'mp4' | 'mov'
type Quality = 'high' | 'balanced' | 'small'
const OUTPUT_LABELS: Record<OutputFormat, string> = {
  mp4: 'MP4 (H.264)',
  mov: 'MOV (H.264)'
}
const QUALITY_LABELS: Record<Quality, string> = {
  high: 'High',
  balanced: 'Balanced',
  small: 'Small file'
}

/** The recorded file name -> the converted output name for the chosen container. */
function outputName(recordedName: string, output: OutputFormat): string {
  const base = recordedName.replace(/\.[^.]+$/, '')
  if (/-audio$/.test(base)) return `${base}.m4a`
  return `${base}.${output}`
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(s % 60)}`
}

/**
 * Live input meter for the selected audio input: a 5-bar spectrum plus a peak
 * dBFS readout (0 dB = clipping) so you can ride the level to just under 0.
 * Captures with the same no-processing constraints as the recorder, so the
 * number reflects what actually gets recorded (no auto-gain masking it).
 */
function AudioMeter({
  deviceId,
  active
}: {
  deviceId: string | null
  active: boolean
}): JSX.Element {
  const barsRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const valRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!active) return
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let raf = 0
    let cancelled = false
    const audio: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
    if (deviceId) audio.deviceId = { exact: deviceId }
    navigator.mediaDevices
      .getUserMedia({ audio })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stream = s
        ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        ctx.createMediaStreamSource(s).connect(analyser)
        const freq = new Uint8Array(analyser.frequencyBinCount)
        const time = new Float32Array(analyser.fftSize)
        const BANDS = 5
        const band = Math.floor(freq.length / BANDS)
        let heldDb = -60 // peak-hold that decays slowly
        const tick = (): void => {
          raf = requestAnimationFrame(tick)
          // Spectrum bars.
          analyser.getByteFrequencyData(freq)
          const bars = barsRef.current?.children
          if (bars) {
            for (let i = 0; i < BANDS; i++) {
              let sum = 0
              for (let j = 0; j < band; j++) sum += freq[i * band + j]
              const v = Math.min(1, sum / band / 170)
              ;(bars[i] as HTMLElement).style.height = `${12 + v * 88}%`
            }
          }
          // Peak dBFS from the raw waveform.
          analyser.getFloatTimeDomainData(time)
          let peak = 0
          for (let i = 0; i < time.length; i++) {
            const a = Math.abs(time[i])
            if (a > peak) peak = a
          }
          const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity
          heldDb = db > heldDb ? db : Math.max(-60, heldDb - 0.6) // fast attack, slow release
          const fill = fillRef.current
          const val = valRef.current
          if (fill && val) {
            const pct = Math.max(0, Math.min(100, ((heldDb + 48) / 48) * 100))
            fill.style.width = `${pct}%`
            const clip = heldDb >= -0.3
            const hot = heldDb >= -6
            fill.style.background = clip ? '#ef4444' : hot ? '#f59e0b' : '#22c55e'
            val.textContent = clip ? 'CLIP' : heldDb <= -59 ? '-∞' : `${heldDb.toFixed(1)}`
            val.style.color = clip ? '#ef4444' : hot ? '#f59e0b' : 'var(--text-secondary)'
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
    <div className="rec-meter">
      <div className="rec-eq" ref={barsRef} title="Audio input spectrum">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="rec-eq-bar" />
        ))}
      </div>
      <div className="rec-db" title="Peak input level (dBFS). Aim just under 0; CLIP = too hot.">
        <div className="rec-db-track">
          <div className="rec-db-fill" ref={fillRef} />
          <span className="rec-db-zero" />
        </div>
        <span className="rec-db-val" ref={valRef}>
          -∞
        </span>
        <span className="rec-db-unit">dB</span>
      </div>
    </div>
  )
}

/**
 * Records the live program to disk by STREAMING chunks straight to a file (no
 * in-memory buffering), so multi-hour sets are safe and a crash only loses the
 * last moment. Capture defaults to hardware H.264 (MP4) at 720p - smooth and
 * light for multi-hour sets; WebM/VP9 software encoding is much heavier. A
 * compact bar keeps Record + timer + input on one row; everything else (folder,
 * convert, repair) lives behind the settings gear.
 */
export function RecordingPanel({
  getCanvas
}: {
  getCanvas: () => HTMLCanvasElement | null
}): JSX.Element {
  const formats = useMemo(() => supportedVideoFormats(), [])
  const [folder, setFolder] = useState<string | null>(() => localStorage.getItem(FOLDER_KEY))
  const [formatMime, setFormatMime] = useState<string>(() => {
    const saved = localStorage.getItem(FORMAT_KEY)
    // Keep a valid saved choice, but migrate off VP9 - its heavy software encode
    // is what made long recordings choppy - to the new default (hardware H.264).
    if (saved && !saved.includes('vp9') && formats.some((f) => f.mimeType === saved)) return saved
    return formats[0]?.mimeType ?? ''
  })
  const [includeAudio, setIncludeAudio] = useState(() => localStorage.getItem(AUDIO_KEY) === '1')
  const [separate, setSeparate] = useState(() => localStorage.getItem(SEPARATE_KEY) === '1')
  const [audioDevice, setAudioDevice] = useState<string | null>(() =>
    localStorage.getItem(AUDIODEV_KEY)
  )
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])

  const [output, setOutput] = useState<OutputFormat>(
    () => (localStorage.getItem(OUTPUT_KEY) as OutputFormat) ?? 'mp4'
  )
  const [quality, setQuality] = useState<Quality>(
    () => (localStorage.getItem(QUALITY_KEY) as Quality) ?? 'balanced'
  )
  const [maxHeight, setMaxHeight] = useState<number>(() =>
    Number(localStorage.getItem(MAXH_KEY) ?? '720')
  )
  const [fps, setFps] = useState<number>(() => Number(localStorage.getItem(FPS_KEY) ?? '30'))
  const [audioDelay, setAudioDelay] = useState<number>(() =>
    Number(localStorage.getItem(AUDIO_DELAY_KEY) ?? '0')
  )
  const [showFps, setShowFps] = useState<boolean>(
    () => localStorage.getItem('djc.camera.showFps') !== '0'
  )

  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [mbps, setMbps] = useState(0)
  const [busy, setBusy] = useState('')
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

  // Tick the elapsed clock + encoder output rate while recording.
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => {
      setElapsed(recorderRef.current.elapsedMs)
      setMbps(recorderRef.current.mbps)
    }, 250)
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
      setError(
        'No program to record. Enable a camera (the auto-director/selected camera is recorded).'
      )
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
        fps,
        includeAudio,
        audioDeviceId: audioDevice,
        separate,
        folder,
        // Add any "push forward" amount so the audio lines up behind the pushed
        // (laggy wireless) camera, on top of the manual audio delay.
        audioDelayMs: audioDelay + Number(localStorage.getItem('djc.camera.globalPush') ?? '0')
      })
      setSaved([])
      setRecording(true)
      // Publish status for the floating monitor window (over IPC - a separate
      // renderer doesn't reliably see cross-window localStorage writes).
      void window.djCompanion.monitor.setStatus({ recording: true, startedAt: Date.now() })
    } catch (err) {
      setError(`Could not start recording: ${(err as Error)?.message ?? err}`)
    }
  }

  const stop = async (): Promise<void> => {
    try {
      // Files are already on disk (streamed); stop just flushes + closes them.
      const paths = await recorderRef.current.stop()
      setRecording(false)
      setSaved(paths)
      void window.djCompanion.monitor.setStatus({ recording: false, startedAt: 0 })
    } catch (err) {
      setRecording(false)
      void window.djCompanion.monitor.setStatus({ recording: false, startedAt: 0 })
      setError(`Could not finish recording: ${(err as Error)?.message ?? err}`)
    }
  }

  const convertSaved = async (path: string): Promise<void> => {
    setError('')
    setBusy('Converting…')
    try {
      const name = path.split('/').pop() ?? 'recording'
      const out = await window.djCompanion.recording.convertFile(
        path,
        outputName(name, output),
        quality
      )
      setSaved((s) => (s.includes(out) ? s : [...s, out]))
    } catch (err) {
      setError(`Convert failed: ${(err as Error)?.message ?? err}`)
    } finally {
      setBusy('')
    }
  }

  const repairSaved = async (path: string): Promise<void> => {
    setError('')
    setBusy('Repairing…')
    try {
      const out = await window.djCompanion.recording.repair(path)
      setSaved((s) => (s.includes(out) ? s : [...s, out]))
    } catch (err) {
      setError(`Repair failed: ${(err as Error)?.message ?? err}`)
    } finally {
      setBusy('')
    }
  }

  // Recover/convert a recording file from a previous session (e.g. after a crash).
  const recoverFile = async (): Promise<void> => {
    const file = await window.djCompanion.dialog.selectFile([
      { name: 'Recordings', extensions: ['webm', 'mp4', 'mov', 'mkv'] }
    ])
    if (!file) return
    setError('')
    setBusy('Repairing…')
    try {
      const out = await window.djCompanion.recording.repair(file)
      setSaved((s) => (s.includes(out) ? s : [...s, out]))
    } catch (err) {
      setError(`Repair failed: ${(err as Error)?.message ?? err}`)
    } finally {
      setBusy('')
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

  const isWebm = (p: string): boolean => /\.webm$/i.test(p)

  if (formats.length === 0) {
    return <p className="settings-hint">Recording is not supported in this build.</p>
  }

  return (
    <div className="cam-rec">
      <div className="rec-bar">
        <button
          className={`cam-rec-btn${recording ? ' recording' : ''}`}
          onClick={recording ? stop : start}
          disabled={!!busy}
        >
          {recording ? '■ Stop' : '● Record'}
        </button>
        <span className={`rec-timer${recording ? ' on' : ''}`}>{fmtElapsed(elapsed)}</span>
        {recording && (
          <span
            className="rec-rate"
            title="Actual encoder output rate. Near your target bitrate = the encoder is keeping up."
          >
            {mbps.toFixed(1)} Mbps
          </span>
        )}
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
        <span className="rec-bar-spacer" />
        {busy && <span className="rec-timer">{busy}</span>}
        <button
          className={`cam-icon-btn${settingsOpen ? ' active' : ''}`}
          title="Recording settings (folder, convert, repair)"
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
          <p className="settings-hint" style={{ margin: 0 }}>
            Streams straight to disk. Use MP4 (H.264, hardware) for long sets: the smoothest and
            lightest on the CPU. Higher resolution / fps look better but cost more CPU; watch the
            per-camera FPS monitor to make sure it holds.
          </p>
          <label className="cam-rec-field">
            <span>Resolution</span>
            <select
              value={maxHeight}
              disabled={recording}
              onChange={(e) => {
                const v = Number(e.target.value)
                setMaxHeight(v)
                localStorage.setItem(MAXH_KEY, String(v))
                window.dispatchEvent(new Event('djc-rec-settings'))
              }}
            >
              <option value={720}>720p (smoothest)</option>
              <option value={1080}>1080p</option>
              <option value={0}>Source (camera max)</option>
            </select>
          </label>
          <label className="cam-rec-field">
            <span>Frame rate</span>
            <select
              value={fps}
              disabled={recording}
              onChange={(e) => {
                const v = Number(e.target.value)
                setFps(v)
                localStorage.setItem(FPS_KEY, String(v))
              }}
            >
              <option value={24}>24 fps (cinematic)</option>
              <option value={30}>30 fps</option>
              <option value={60}>60 fps (heavy)</option>
            </select>
          </label>
          <label className="cam-rec-field">
            <span>Capture</span>
            <select
              value={formatMime}
              onChange={(e) => setFormat(e.target.value)}
              disabled={recording}
            >
              {formats.map((f: RecordFormat) => (
                <option key={f.mimeType} value={f.mimeType}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="cam-rec-field">
            <span>Convert to</span>
            <select
              value={output}
              disabled={!!busy}
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
          <label className="cam-rec-field">
            <span>Quality</span>
            <select
              value={quality}
              disabled={!!busy}
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
          <label
            className="cam-rec-field"
            title="Delay the recorded audio to line it up with the cameras (for wireless/latency)."
          >
            <span>Audio delay</span>
            <input
              type="range"
              min={0}
              max={1000}
              step={10}
              disabled={recording}
              value={audioDelay}
              onChange={(e) => {
                const v = Number(e.target.value)
                setAudioDelay(v)
                localStorage.setItem(AUDIO_DELAY_KEY, String(v))
              }}
            />
            <span className="cam-delay-val">{audioDelay} ms</span>
          </label>
          <label className="cam-rec-check">
            <input
              type="checkbox"
              checked={showFps}
              onChange={(e) => {
                setShowFps(e.target.checked)
                localStorage.setItem('djc.camera.showFps', e.target.checked ? '1' : '0')
                window.dispatchEvent(new Event('djc-rec-settings'))
              }}
            />
            Show FPS monitor on cameras
          </label>
          <button
            className="cam-output-btn"
            title="Floating always-on-top window showing the live program + REC status, so you can watch it while using other apps"
            onClick={() => window.djCompanion.monitor.open()}
          >
            ⧉ Pop-out floating monitor (always on top)
          </button>
          <button className="cam-output-btn" onClick={recoverFile} disabled={!!busy}>
            Recover / fix a recording file…
          </button>
        </div>
      )}

      {saved.length > 0 && (
        <div className="cam-rec-saved">
          {saved.map((p) => (
            <div key={p} className="cam-rec-saved-row">
              <button
                className="cam-rec-saved-link"
                onClick={() => window.djCompanion.recording.reveal(p)}
              >
                Saved: {p.split('/').pop()}
              </button>
              {isWebm(p) && (
                <>
                  <button
                    className="cam-rec-mini"
                    disabled={!!busy}
                    onClick={() => convertSaved(p)}
                  >
                    → {output.toUpperCase()}
                  </button>
                  <button
                    className="cam-rec-mini"
                    disabled={!!busy}
                    title="Re-mux into a clean copy"
                    onClick={() => repairSaved(p)}
                  >
                    Fix
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p className="settings-hint">{error}</p>}
    </div>
  )
}
