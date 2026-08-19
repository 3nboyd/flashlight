import { useEffect, useRef, useState, type JSX } from 'react'
import { CameraCanvas, ZERO_AUDIO } from '../../camera/CameraCanvas'
import { ScreenBase, type ScreenLook } from '../../camera/ScreenBase'
import { getVisual, defaultParams, type AudioReact } from '../../camera/VisualEngine'
import './OutputView.css'

const STORE_KEY = 'djc.camera.enabled'
const PRIMARY_KEY = 'djc.camera.primary'
const FX_KEY = 'djc.camera.fx'
const MODE_KEY = 'djc.output.mode' // 'camera' | 'screen'
const LOOK_KEY = 'djc.output.screenLook' // 'flat' | 'radial'
const SOURCE_KEY = 'djc.output.screenSource' // 'auto' | patchId
const OVERLAY_KEY = 'djc.output.overlay' // 'none' | visual id
const OVERLAY_OP_KEY = 'djc.output.overlayOpacity' // 0-1
const CAM_SOURCE_KEY = 'djc.output.cameraSource' // 'program' | deviceId
const CAM_EFFECT_KEY = 'djc.output.cameraEffect' // 'camera' | visual id

/** The program camera (what the operator/director currently cut to). */
function readProgram(): string | null {
  const explicit = localStorage.getItem(PRIMARY_KEY)
  if (explicit) return explicit
  try {
    const enabled = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as string[]
    return enabled[0] ?? null
  } catch {
    return null
  }
}

/** The camera the projector shows: a fixed device, or 'program' to follow. */
function readCamSource(): string {
  return localStorage.getItem(CAM_SOURCE_KEY) ?? 'program'
}
function resolveDevice(source: string): string | null {
  return source && source !== 'program' ? source : readProgram()
}

function readParams(visual: string): Record<string, number> {
  let stored: Record<string, number> = {}
  try {
    const all = JSON.parse(localStorage.getItem(FX_KEY) ?? '{}') as Record<
      string,
      Record<string, number>
    >
    stored = all[visual] ?? {}
  } catch {
    /* defaults only */
  }
  return { ...defaultParams(getVisual(visual)), ...stored }
}

/**
 * Full-screen projector / stage-TV surface. Two modes, both synced from the main
 * window through localStorage and the lighting clock:
 *  - 'camera': mirrors the operator's chosen effect on the primary camera.
 *  - 'screen': a TV/LED-screen driven by a screen fixture's live lighting color
 *    (flat or radial pulse), optionally with a camera effect blended over it.
 * This is the live IRL screen bus - independent of what the recording is doing.
 */
export function OutputView(): JSX.Element {
  const [mode, setMode] = useState<string>(() => localStorage.getItem(MODE_KEY) ?? 'camera')
  const [look, setLook] = useState<ScreenLook>(
    () => (localStorage.getItem(LOOK_KEY) as ScreenLook) ?? 'flat'
  )
  const [source, setSource] = useState<string>(() => localStorage.getItem(SOURCE_KEY) ?? 'auto')
  const [overlay, setOverlay] = useState<string>(() => localStorage.getItem(OVERLAY_KEY) ?? 'none')
  const [overlayOp, setOverlayOp] = useState<number>(() =>
    Number(localStorage.getItem(OVERLAY_OP_KEY) ?? '0.6')
  )
  const [visual, setVisual] = useState<string>(() => localStorage.getItem(CAM_EFFECT_KEY) ?? 'camera')
  const [primary, setPrimary] = useState<string | null>(() => resolveDevice(readCamSource()))
  const [params, setParams] = useState<Record<string, number>>(() =>
    readParams(localStorage.getItem(CAM_EFFECT_KEY) ?? 'camera')
  )
  const beatRef = useRef(0)
  const audioRef = useRef<AudioReact>({ ...ZERO_AUDIO })
  const lightRef = useRef<{ r: number; g: number; b: number }>({ r: 0, g: 0, b: 0 })
  // The screen surface's own color (a chosen screen fixture, or the whole rig).
  const screenColorRef = useRef<{ r: number; g: number; b: number }>({ r: 0, g: 0, b: 0 })
  const sourceRef = useRef(source)
  sourceRef.current = source

  // Follow the operator's choices live.
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === CAM_EFFECT_KEY) {
        const v = e.newValue ?? 'camera'
        setVisual(v)
        setParams(readParams(v))
      }
      if (e.key === FX_KEY) setParams((prev) => ({ ...prev, ...readParams(visual) }))
      if (e.key === CAM_SOURCE_KEY) setPrimary(resolveDevice(e.newValue ?? 'program'))
      // Program moved (director cut): only matters when we're following it.
      if (e.key === PRIMARY_KEY || e.key === STORE_KEY) setPrimary(resolveDevice(readCamSource()))
      if (e.key === MODE_KEY) setMode(e.newValue ?? 'camera')
      if (e.key === LOOK_KEY) setLook((e.newValue as ScreenLook) ?? 'flat')
      if (e.key === SOURCE_KEY) setSource(e.newValue ?? 'auto')
      if (e.key === OVERLAY_KEY) setOverlay(e.newValue ?? 'none')
      if (e.key === OVERLAY_OP_KEY) setOverlayOp(Number(e.newValue ?? '0.6'))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [visual])

  // Poll the lighting clock + audio + screen colors.
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
        const src = sourceRef.current
        if (src === 'auto') {
          screenColorRef.current = s.lightColor ?? { r: 0, g: 0, b: 0 }
        } else {
          const scr = s.screens?.find((x) => x.patchId === src)
          screenColorRef.current = scr
            ? { r: scr.r * scr.intensity, g: scr.g * scr.intensity, b: scr.b * scr.intensity }
            : { r: 0, g: 0, b: 0 }
        }
      } catch {
        /* lighting not ready */
      }
    }, 45)
    return () => clearInterval(id)
  }, [])

  if (mode === 'screen') {
    return (
      <div className="output-view output-screen">
        <ScreenBase
          colorRef={screenColorRef}
          beatRef={beatRef}
          look={look}
          className="output-canvas"
        />
        {overlay !== 'none' && primary && (
          <CameraCanvas
            key={`ov-${primary}-${overlay}`}
            deviceId={primary}
            visualId={overlay}
            params={readParams(overlay)}
            beatRef={beatRef}
            audioRef={audioRef}
            lightRef={lightRef}
            className="output-overlay"
          />
        )}
        {overlay !== 'none' && primary && (
          <style>{`.output-overlay{opacity:${overlayOp}}`}</style>
        )}
      </div>
    )
  }

  return (
    <div className="output-view">
      {primary ? (
        <CameraCanvas
          key={primary}
          deviceId={primary}
          visualId={visual}
          params={params}
          beatRef={beatRef}
          audioRef={audioRef}
          lightRef={lightRef}
          className="output-canvas"
        />
      ) : (
        <div className="output-empty">No camera selected. Enable one in the main window.</div>
      )}
    </div>
  )
}
