import { useEffect, useRef, useState, type JSX } from 'react'
import { CameraCanvas, ZERO_AUDIO } from '../camera/CameraCanvas'
import { getVisual, defaultParams, type AudioReact } from '../camera/VisualEngine'
import './MonitorView.css'

const STORE_KEY = 'djc.camera.enabled'
const PRIMARY_KEY = 'djc.camera.primary'
const VISUAL_KEY = 'djc.camera.visual'
const FX_KEY = 'djc.camera.fx'
const EFFECTS_ONLY_KEY = 'djc.output.effectsOnly'
const REC_STATUS_KEY = 'djc.rec.status'

function readPrimary(): string | null {
  const explicit = localStorage.getItem(PRIMARY_KEY)
  if (explicit) return explicit
  try {
    return (JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as string[])[0] ?? null
  } catch {
    return null
  }
}

/** The effect the recording is actually using: clean when "effects only for
 *  projector" is on, else the program camera's effect. */
function readEffect(): string {
  if (localStorage.getItem(EFFECTS_ONLY_KEY) === '1') return 'camera'
  return localStorage.getItem(VISUAL_KEY) || 'camera'
}

function readParams(visual: string): Record<string, number> {
  let stored: Record<string, number> = {}
  try {
    stored = (JSON.parse(localStorage.getItem(FX_KEY) ?? '{}') as Record<string, Record<string, number>>)[visual] ?? {}
  } catch {
    /* defaults only */
  }
  return { ...defaultParams(getVisual(visual)), ...stored }
}

function readRec(): { recording: boolean; startedAt: number } {
  try {
    return JSON.parse(localStorage.getItem(REC_STATUS_KEY) ?? '{}')
  } catch {
    return { recording: false, startedAt: 0 }
  }
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

/**
 * Floating always-on-top recording monitor: a picture-in-picture of the live
 * program (final mix) plus a REC indicator, so the operator can glance at it
 * while working in other apps. Mirrors the recording by reading the same
 * localStorage the main window writes, and polls the lighting clock so effects
 * still animate.
 */
export function MonitorView(): JSX.Element {
  const [device, setDevice] = useState<string | null>(() => readPrimary())
  const [effect, setEffect] = useState<string>(() => readEffect())
  const [rec, setRec] = useState(() => readRec())
  const [elapsed, setElapsed] = useState(0)
  const beatRef = useRef(0)
  const audioRef = useRef<AudioReact>({ ...ZERO_AUDIO })
  const lightRef = useRef<{ r: number; g: number; b: number }>({ r: 0, g: 0, b: 0 })

  // Follow the program + recording state (localStorage the main window writes).
  useEffect(() => {
    const id = setInterval(() => {
      setDevice(readPrimary())
      setEffect(readEffect())
      setRec(readRec())
    }, 500)
    return () => clearInterval(id)
  }, [])

  // Keep the elapsed clock ticking from the recording start time.
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(rec.recording && rec.startedAt ? Date.now() - rec.startedAt : 0)
    }, 250)
    return () => clearInterval(id)
  }, [rec])

  // Drive effects from the lighting clock + audio, like the projector output.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const s = await window.djCompanion.lighting.getStatus()
        beatRef.current = s.beatPhase ?? 0
        audioRef.current = {
          level: s.audioLevel ?? 0,
          kick: s.audioKick ?? 0,
          fast: s.audioFast ?? 0,
          surge: s.audioSurge ?? 0
        }
        if (s.lightColor) lightRef.current = s.lightColor
      } catch {
        /* lighting not ready */
      }
    }, 60)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="monitor">
      <div className="monitor-bar">
        <span className={`monitor-rec${rec.recording ? ' on' : ''}`}>
          ● {rec.recording ? `REC ${fmt(elapsed)}` : 'not recording'}
        </span>
        <button
          className="monitor-close"
          title="Close monitor"
          onClick={() => window.djCompanion.monitor.close()}
        >
          ✕
        </button>
      </div>
      <div className="monitor-video">
        {device ? (
          <CameraCanvas
            key={`${device}-${effect}`}
            deviceId={device}
            visualId={effect}
            params={readParams(effect)}
            beatRef={beatRef}
            audioRef={audioRef}
            lightRef={lightRef}
            className="monitor-canvas"
          />
        ) : (
          <div className="monitor-empty">No program camera</div>
        )}
      </div>
    </div>
  )
}
