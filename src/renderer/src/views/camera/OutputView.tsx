import { useEffect, useRef, useState, type JSX } from 'react'
import { CameraCanvas, ZERO_AUDIO } from '../../camera/CameraCanvas'
import type { AudioReact } from '../../camera/VisualEngine'
import './OutputView.css'

const STORE_KEY = 'djc.camera.enabled'
const VISUAL_KEY = 'djc.camera.visual'
const PRIMARY_KEY = 'djc.camera.primary'

function readPrimary(): string | null {
  const explicit = localStorage.getItem(PRIMARY_KEY)
  if (explicit) return explicit
  try {
    const enabled = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as string[]
    return enabled[0] ?? null
  } catch {
    return null
  }
}

/**
 * Full-screen projector / stage-TV surface. Renders the same visual the main
 * window shows, on the same primary camera, staying in sync through localStorage
 * (effect + primary device) and the lighting clock (beat + audio).
 */
export function OutputView(): JSX.Element {
  const [visual, setVisual] = useState<string>(() => localStorage.getItem(VISUAL_KEY) ?? 'camera')
  const [primary, setPrimary] = useState<string | null>(() => readPrimary())
  const beatRef = useRef(0)
  const audioRef = useRef<AudioReact>({ ...ZERO_AUDIO })

  // Follow the operator's effect + camera choices live.
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === VISUAL_KEY) setVisual(e.newValue ?? 'camera')
      if (e.key === PRIMARY_KEY || e.key === STORE_KEY) setPrimary(readPrimary())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Poll the lighting clock + audio features (same as the main window).
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
      } catch {
        /* lighting not ready */
      }
    }, 45)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="output-view">
      {primary ? (
        <CameraCanvas
          key={primary}
          deviceId={primary}
          visualId={visual}
          beatRef={beatRef}
          audioRef={audioRef}
          className="output-canvas"
        />
      ) : (
        <div className="output-empty">No camera selected. Enable one in the main window.</div>
      )}
    </div>
  )
}
