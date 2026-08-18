import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { CameraCanvas, ZERO_FEAT, ZERO_AUDIO } from '../../camera/CameraCanvas'
import { VISUALS, getVisual, defaultParams, type AudioReact, type VisualModule } from '../../camera/VisualEngine'
import type { PoseFeatureState } from '../../camera/PoseFeatures'
import type { FaceFrame } from '../../camera/FaceEngine'
import { framingSignal } from '../../camera/framing'
import { CameraDirector, holdBoundsFromAverage, type CameraSignal } from '@core/camera/CameraDirector'
import { CAMERA_ROLES, DEFAULT_CAMERA_ROLE, defaultLookSwitch, type CameraRole } from '@core/camera/roles'
import {
  loadDirectorSettings,
  saveDirectorSettings,
  type DirectorSettings
} from '../../camera/directorSettings'
import { DirectorSettingsPanel } from './DirectorSettingsPanel'
import { RecordingPanel } from './RecordingPanel'
import { midiPads } from '../lighting/runtime'
import './CameraView.css'

const STORE_KEY = 'djc.camera.enabled'
const VISUAL_KEY = 'djc.camera.visual'
const PRIMARY_KEY = 'djc.camera.primary'
const FX_KEY = 'djc.camera.fx'
const CONFIGS_KEY = 'djc.camera.configs'
const AUTO_KEY = 'djc.camera.autodirector'
const CAM_MIDI_KEY = 'djc.camera.midi'
const DISPLAY_KEY = 'djc.camera.display'

// Dead-feed detection: a camera whose average brightness stays below DARK_LUMA
// for DEAD_MS is treated as a dead/black feed the director should skip.
const DARK_LUMA = 0.02
const DEAD_MS = 4000

/** Aspect-ratio options for the camera tiles (CSS aspect-ratio value). */
const ASPECTS: { id: string; label: string; css: string; ratio: number | null }[] = [
  { id: '16:9', label: 'Landscape 16:9', css: '16 / 9', ratio: 16 / 9 },
  { id: '4:3', label: 'Landscape 4:3', css: '4 / 3', ratio: 4 / 3 },
  { id: '1:1', label: 'Square 1:1', css: '1 / 1', ratio: 1 },
  { id: '9:16', label: 'Portrait 9:16', css: '9 / 16', ratio: 9 / 16 },
  // null ratio = keep the source camera's own shape.
  { id: 'source', label: 'Match camera', css: 'auto', ratio: null }
]

/** Columns/rows that pack N camera tiles into a tight collage. When the grid
 *  has a spare trailing cell, the live "final cut" preview fills it. */
function collageDims(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 }
  if (n === 2) return { cols: 2, rows: 1 }
  if (n <= 4) return { cols: 2, rows: 2 }
  if (n <= 6) return { cols: 3, rows: 2 }
  if (n <= 9) return { cols: 3, rows: 3 }
  if (n <= 12) return { cols: 4, rows: 3 }
  return { cols: 4, rows: Math.ceil(n / 4) }
}
const MODE_KEY = 'djc.output.mode'
const LOOK_KEY = 'djc.output.screenLook'
const SOURCE_KEY = 'djc.output.screenSource'
const OVERLAY_KEY = 'djc.output.overlay'
const OVERLAY_OP_KEY = 'djc.output.overlayOpacity'

type FxParams = Record<string, Record<string, number>>
type ScreenInfo = { patchId: string; label: string }
type CameraConfig = {
  role: CameraRole
  effect: string
  /** Optional second effect layered over the base (Shift+click to combine). */
  overlay?: string
  lookSwitch?: boolean
  /** Director usage weight (1 = equal). */
  priority?: number
}
/** A MIDI note bound to a camera action: cut the program to a camera, or toggle
 *  the auto-director. */
type CamMidiAction = { kind: 'cut'; deviceId: string } | { kind: 'auto' }
const sameMidiAction = (a: CamMidiAction, b: CamMidiAction): boolean =>
  a.kind === b.kind && (a.kind !== 'cut' || a.deviceId === (b as { deviceId: string }).deviceId)
const ROLE_LABEL: Record<CameraRole, string> = Object.fromEntries(
  CAMERA_ROLES.map((r) => [r.role, r.label])
) as Record<CameraRole, string>

/** One live camera tile wrapping the shared canvas. */
function CameraTile({
  deviceId,
  role,
  effect,
  overlay,
  params,
  overlayParams,
  fit,
  program,
  focused,
  detectFraming,
  recordCanvas,
  recordAspect,
  showSkeleton,
  showFaceMesh,
  beatRef,
  audioRef,
  lightRef,
  onFraming,
  onFeatures,
  onStatus,
  onClick
}: {
  deviceId: string
  role: CameraRole
  effect: string
  overlay: string
  params: Record<string, number>
  overlayParams: Record<string, number>
  fit: 'fit' | 'fill'
  program: boolean
  focused: boolean
  /** Run detection for the auto-director (only worth it when Director Mode is on). */
  detectFraming: boolean
  /** Full-res record canvas, non-null only for the program tile. */
  recordCanvas: HTMLCanvasElement | null
  recordAspect: number | null
  showSkeleton: boolean
  showFaceMesh: boolean
  beatRef: React.MutableRefObject<number>
  audioRef: React.MutableRefObject<AudioReact>
  lightRef: React.MutableRefObject<{ r: number; g: number; b: number }>
  onFraming: (feat: PoseFeatureState, face: FaceFrame | null, luma: number) => void
  onFeatures?: (f: PoseFeatureState) => void
  onStatus?: (s: string) => void
  onClick: () => void
}): JSX.Element {
  return (
    <div
      className={`cam-tile${program ? ' program' : ''}${focused ? ' focused' : ''}`}
      onClick={onClick}
    >
      <CameraCanvas
        deviceId={deviceId}
        visualId={effect}
        overlayId={overlay}
        params={params}
        overlayParams={overlayParams}
        fit={fit}
        recordCanvas={recordCanvas}
        recordAspect={recordAspect}
        showSkeleton={focused && showSkeleton}
        showFaceMesh={focused && showFaceMesh}
        detectFraming={detectFraming}
        framingNeedsFace={role === 'headon' || role === 'laptop'}
        beatRef={beatRef}
        audioRef={audioRef}
        lightRef={lightRef}
        onFraming={onFraming}
        onFeatures={focused ? onFeatures : undefined}
        onStatus={onStatus}
      />
      <span className="cam-badge role">{ROLE_LABEL[role]}</span>
      {program && <span className="cam-badge program">● PROGRAM</span>}
    </div>
  )
}

function Meter({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="cam-meter">
      <span className="cam-meter-label">{label}</span>
      <div className="cam-meter-track">
        <div className="cam-meter-fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  )
}

export function CameraView({ embedded = false }: { embedded?: boolean } = {}): JSX.Element {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [enabled, setEnabled] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const [configs, setConfigs] = useState<Record<string, CameraConfig>>(() => {
    try {
      return JSON.parse(localStorage.getItem(CONFIGS_KEY) ?? '{}') as Record<string, CameraConfig>
    } catch {
      return {}
    }
  })
  const [focused, setFocused] = useState<string | null>(null)
  const [auto, setAuto] = useState<boolean>(() => localStorage.getItem(AUTO_KEY) === '1')
  const [programId, setProgramId] = useState<string | null>(null)
  const [camMidi, setCamMidi] = useState<Record<number, CamMidiAction>>(() => {
    try {
      return JSON.parse(localStorage.getItem(CAM_MIDI_KEY) ?? '{}') as Record<number, CamMidiAction>
    } catch {
      return {}
    }
  })
  const [midiLearn, setMidiLearn] = useState<CamMidiAction | null>(null)
  // Embedded (operator) mode: the setup sidebar becomes a gear-triggered drawer.
  const [camGear, setCamGear] = useState(false)
  const [directorOpen, setDirectorOpen] = useState(false)
  const [director, setDirector] = useState<DirectorSettings>(() => loadDirectorSettings())
  const [display, setDisplay] = useState<{ aspect: string; fit: 'fit' | 'fill' }>(() => {
    try {
      return { aspect: '16:9', fit: 'fill', ...JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? '{}') }
    } catch {
      return { aspect: '16:9', fit: 'fill' }
    }
  })
  const [fxParams, setFxParams] = useState<FxParams>(() => {
    try {
      return JSON.parse(localStorage.getItem(FX_KEY) ?? '{}') as FxParams
    } catch {
      return {}
    }
  })
  const [feat, setFeat] = useState<PoseFeatureState>(ZERO_FEAT)
  const [status, setStatus] = useState('')
  const [needsPermission, setNeedsPermission] = useState(true)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [showFaceMesh, setShowFaceMesh] = useState(false)
  const [outputOpen, setOutputOpen] = useState(false)
  const [outMode, setOutMode] = useState<string>(() => localStorage.getItem(MODE_KEY) ?? 'camera')
  const [screenLook, setScreenLook] = useState<string>(() => localStorage.getItem(LOOK_KEY) ?? 'flat')
  const [screenSource, setScreenSource] = useState<string>(
    () => localStorage.getItem(SOURCE_KEY) ?? 'auto'
  )
  const [overlay, setOverlay] = useState<string>(() => localStorage.getItem(OVERLAY_KEY) ?? 'none')
  const [overlayOp, setOverlayOp] = useState<number>(() =>
    Number(localStorage.getItem(OVERLAY_OP_KEY) ?? '0.6')
  )
  const [screens, setScreens] = useState<ScreenInfo[]>([])
  const beatRef = useRef(0)
  const audioRef = useRef<AudioReact>({ ...ZERO_AUDIO })
  const lightRef = useRef<{ r: number; g: number; b: number }>({ r: 0, g: 0, b: 0 })
  // Auto-director + program compositor plumbing.
  const directorRef = useRef(new CameraDirector())
  const framingsRef = useRef<Record<string, CameraSignal>>({})
  // Per-camera timestamp of when its feed first went near-black (for dead-feed
  // avoidance); absent = the feed is live.
  const deadTimersRef = useRef<Record<string, number>>({})
  const programCanvasRef = useRef<HTMLCanvasElement | null>(null)
  // Visible mirrors of the program: a small corner preview and an enlarged popup.
  const programPreviewRef = useRef<HTMLCanvasElement | null>(null)
  const programBigRef = useRef<HTMLCanvasElement | null>(null)
  const programIdRef = useRef<string | null>(null)
  const enabledRef = useRef<string[]>([])
  const configsRef = useRef<Record<string, CameraConfig>>({})
  const autoRef = useRef(false)
  const manualIdRef = useRef<string | null>(null)
  const camMidiRef = useRef<Record<number, CamMidiAction>>({})
  const directorRefSettings = useRef<DirectorSettings>(director)
  const lastBeatPhaseRef = useRef(0)
  const surgeArmedRef = useRef(true)
  // Whether the corner program preview is enlarged into a popup.
  const [programBig, setProgramBig] = useState(false)
  // The hidden record canvas element, tracked in state so the program tile
  // receives it as a prop (a plain ref would be null on the first render).
  const [recCanvasEl, setRecCanvasEl] = useState<HTMLCanvasElement | null>(null)
  const setProgramCanvas = useCallback((el: HTMLCanvasElement | null) => {
    programCanvasRef.current = el
    setRecCanvasEl(el)
  }, [])
  // Transient beat-drop effect override: { effect, until } for the program cam.
  const [dropFx, setDropFx] = useState<{ effect: string; until: number } | null>(null)
  const dropFxRef = useRef(dropFx)
  programIdRef.current = programId
  autoRef.current = auto
  camMidiRef.current = camMidi
  directorRefSettings.current = director
  dropFxRef.current = dropFx

  const getConfig = useCallback(
    (id: string): Required<CameraConfig> => {
      const c = configs[id] ?? { role: DEFAULT_CAMERA_ROLE, effect: 'camera' }
      return {
        role: c.role,
        effect: c.effect,
        overlay: c.overlay && c.overlay !== c.effect ? c.overlay : '',
        lookSwitch: c.lookSwitch ?? defaultLookSwitch(c.role),
        priority: c.priority ?? 1
      }
    },
    [configs]
  )

  const refresh = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      const cams = list.filter((d) => d.kind === 'videoinput')
      setDevices(cams)
      // Once the real list is known (permission granted, labels present), drop
      // any enabled id that no longer maps to a present camera. macOS rotates
      // camera deviceIds between sessions, so stale ids accumulated and each
      // rendered a phantom tile; pruning makes the grid self-heal.
      if (cams.length > 0 && cams.some((c) => c.label)) {
        setNeedsPermission(false)
        const present = new Set(cams.map((c) => c.deviceId))
        setEnabled((cur) => {
          const kept = cur.filter((id) => present.has(id))
          return kept.length === cur.length ? cur : kept
        })
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh)
  }, [refresh])

  // Poll the lighting clock + audio features so visuals stay music-reactive.
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

        // Beat-drop effect: a big surge (silence->boom / drop) fires a random
        // allowed effect on the program for a moment. Armed/disarmed with
        // hysteresis so one drop triggers once.
        const surge = s.audioSurge ?? 0
        const d = directorRefSettings.current.drop
        if (surge < 0.25) surgeArmedRef.current = true
        if (
          d.enabled &&
          d.effects.length > 0 &&
          surge > 0.6 &&
          surgeArmedRef.current &&
          (dropFxRef.current === null || dropFxRef.current.until < performance.now())
        ) {
          surgeArmedRef.current = false
          const effect = d.effects[Math.floor(Math.random() * d.effects.length)]
          setDropFx({ effect, until: performance.now() + d.durationMs })
        }
      } catch {
        /* lighting not ready */
      }
    }, 45)
    return () => clearInterval(id)
  }, [])

  // Clear the beat-drop override when its window ends.
  useEffect(() => {
    if (!dropFx) return
    const left = dropFx.until - performance.now()
    const t = setTimeout(() => setDropFx(null), Math.max(0, left))
    return () => clearTimeout(t)
  }, [dropFx])

  // Track whether the projector output window is open.
  useEffect(() => {
    let alive = true
    window.djCompanion.output
      ?.isOpen()
      .then((v) => alive && setOutputOpen(v))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  // Poll the patched TV/screen fixtures (slow; the list rarely changes).
  useEffect(() => {
    let last = ''
    const id = setInterval(async () => {
      try {
        const s = await window.djCompanion.lighting.getStatus()
        const list: ScreenInfo[] = (s.screens ?? []).map((x) => ({
          patchId: x.patchId,
          label: x.label
        }))
        const key = JSON.stringify(list)
        if (key !== last) {
          last = key
          setScreens(list)
        }
      } catch {
        /* lighting not ready */
      }
    }, 1500)
    return () => clearInterval(id)
  }, [])

  // Stage-screen settings: persist AND notify the projector window (a separate
  // window receives the storage event; the setItem here won't fire it locally).
  const putOut = (key: string, value: string, set: (v: string) => void): void => {
    set(value)
    localStorage.setItem(key, value)
  }

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(enabled))
    enabledRef.current = enabled
    // Seed a default config for any newly-enabled camera.
    setConfigs((prev) => {
      let changed = false
      const next = { ...prev }
      enabled.forEach((id, i) => {
        if (!next[id]) {
          const role: CameraRole = i === 0 ? 'headon' : 'other'
          next[id] = { role, effect: 'camera', lookSwitch: defaultLookSwitch(role) }
          changed = true
        }
      })
      return changed ? next : prev
    })
    setFocused((f) => (f && enabled.includes(f) ? f : (enabled[0] ?? null)))
    if (!manualIdRef.current || !enabled.includes(manualIdRef.current)) {
      manualIdRef.current = enabled[0] ?? null
    }
  }, [enabled])

  useEffect(() => {
    configsRef.current = configs
    localStorage.setItem(CONFIGS_KEY, JSON.stringify(configs))
  }, [configs])
  useEffect(() => localStorage.setItem(FX_KEY, JSON.stringify(fxParams)), [fxParams])
  useEffect(() => localStorage.setItem(AUTO_KEY, auto ? '1' : '0'), [auto])
  useEffect(() => localStorage.setItem(DISPLAY_KEY, JSON.stringify(display)), [display])

  // Mirror the program camera to the projector's camera-mode + recording source.
  useEffect(() => {
    if (programId) {
      localStorage.setItem(PRIMARY_KEY, programId)
      localStorage.setItem(VISUAL_KEY, configs[programId]?.effect ?? 'camera')
    }
  }, [programId, configs])

  // Auto-director: gather each camera's framing signal + music context and pick
  // the program camera. When auto is off, honor the manual pick.
  useEffect(() => {
    const id = setInterval(() => {
      const ids = enabledRef.current
      if (ids.length === 0) {
        setProgramId((p) => (p === null ? p : null))
        return
      }
      const director = directorRef.current
      director.setManual(autoRef.current ? null : manualIdRef.current)
      let candidates = ids
      // Skip cameras whose feed has been black/frozen for a few seconds, unless
      // that would leave nothing (then fall back to all so we never go blank).
      if (directorRefSettings.current.avoidDeadCameras) {
        const now = performance.now()
        const live = ids.filter((cid) => {
          const since = deadTimersRef.current[cid]
          return since == null || now - since < DEAD_MS
        })
        if (live.length > 0) candidates = live
      }
      const signals: CameraSignal[] = candidates.map(
        (cid) =>
          framingsRef.current[cid] ?? {
            id: cid,
            role: configsRef.current[cid]?.role ?? 'other',
            present: 0,
            motion: 0,
            facing: 0,
            lookingAtBoard: 0,
            lookSwitch: configsRef.current[cid]?.lookSwitch ?? true,
            priority: configsRef.current[cid]?.priority ?? 1
          }
      )
      // A beat lands when beatPhase wraps (drops back toward 0).
      const bp = beatRef.current
      const onBeat = bp < lastBeatPhaseRef.current
      lastBeatPhaseRef.current = bp
      const dec = director.update(signals, {
        nowMs: performance.now(),
        audioLevel: audioRef.current.level,
        surge: audioRef.current.surge,
        onBeat
      })
      setProgramId((p) => (p === dec.activeId ? p : dec.activeId))
    }, 120)
    return () => clearInterval(id)
  }, [])

  // Push settings-panel values into the pure director whenever they change.
  useEffect(() => {
    saveDirectorSettings(director)
    const { minHoldMs, maxHoldMs } = holdBoundsFromAverage(director.avgHoldMs)
    directorRef.current.setConfig({
      minHoldMs,
      maxHoldMs,
      hysteresis: director.hysteresis,
      switchOnBeat: director.switchOnBeat
    })
  }, [director])

  // Preview mirror: the program tile renders the full-res final cut into the
  // hidden record canvas (see CameraCanvas recordCanvas); here we just copy that
  // into the visible corner + popup + collage-cell previews (downscaled by CSS).
  useEffect(() => {
    let raf = 0
    const copy = (dst: HTMLCanvasElement | null, src: HTMLCanvasElement): void => {
      if (!dst) return
      if (dst.width !== src.width || dst.height !== src.height) {
        dst.width = src.width
        dst.height = src.height
      }
      const ctx = dst.getContext('2d')
      if (ctx) ctx.drawImage(src, 0, 0)
    }
    const loop = (): void => {
      raf = requestAnimationFrame(loop)
      const rec = programCanvasRef.current
      if (!rec || rec.width === 0) return
      copy(programPreviewRef.current, rec)
      copy(programBigRef.current, rec)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [])

  // Per-camera MIDI: listen for bound notes and act (cut program / toggle auto).
  useEffect(() => localStorage.setItem(CAM_MIDI_KEY, JSON.stringify(camMidi)), [camMidi])
  useEffect(() => {
    void midiPads.ensureStarted()
    const off = midiPads.addNoteListener((note, _vel, isNoteOn) => {
      if (!isNoteOn) return
      const a = camMidiRef.current[note]
      if (!a) return
      if (a.kind === 'auto') {
        setAuto((v) => !v)
      } else {
        if (!enabledRef.current.includes(a.deviceId)) return
        setAuto(false)
        manualIdRef.current = a.deviceId
        setProgramId(a.deviceId)
      }
    })
    return off
  }, [])

  const requestPermission = async (): Promise<void> => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true })
      s.getTracks().forEach((t) => t.stop())
      setNeedsPermission(false)
      await refresh()
    } catch {
      setStatus('Camera permission is required to use this section.')
    }
  }

  const toggleOutput = async (): Promise<void> => {
    try {
      if (outputOpen) {
        await window.djCompanion.output?.close()
        setOutputOpen(false)
      } else {
        await window.djCompanion.output?.open()
        setOutputOpen(true)
      }
    } catch (err) {
      setStatus(`Output window error: ${(err as Error)?.message ?? err}`)
    }
  }

  const toggle = (id: string): void =>
    setEnabled((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const onFeatures = useCallback((f: PoseFeatureState) => setFeat({ ...f }), [])
  const onFraming = useCallback(
    (id: string, f: PoseFeatureState, face: FaceFrame | null, luma: number) => {
      const cfg = configsRef.current[id]
      const role = cfg?.role ?? 'other'
      const lookSwitch = cfg?.lookSwitch ?? defaultLookSwitch(role)
      framingsRef.current[id] = framingSignal(id, role, f, face, lookSwitch, cfg?.priority ?? 1)
      // Track how long this feed has been near-black, to spot a dead camera.
      const now = performance.now()
      const t = deadTimersRef.current
      if (luma < DARK_LUMA) t[id] = t[id] ?? now
      else delete t[id]
    },
    []
  )
  const setRole = useCallback((id: string, role: CameraRole) => {
    setConfigs((prev) => ({ ...prev, [id]: { ...prev[id], role, effect: prev[id]?.effect ?? 'camera' } }))
  }, [])
  const setEffect = useCallback((id: string, effect: string) => {
    setConfigs((prev) => {
      const base = prev[id] ?? { role: DEFAULT_CAMERA_ROLE, effect: 'camera' }
      // Don't leave an overlay equal to the new base (it would be a no-op layer).
      const overlay = base.overlay === effect ? undefined : base.overlay
      return { ...prev, [id]: { ...base, role: base.role ?? DEFAULT_CAMERA_ROLE, effect, overlay } }
    })
  }, [])
  // Shift+click sets/toggles a second effect layered over the base.
  const setCombine = useCallback((id: string, combineId: string) => {
    setConfigs((prev) => {
      const base = prev[id] ?? { role: DEFAULT_CAMERA_ROLE, effect: 'camera' }
      // Clicking the current overlay (or the base itself) clears the combo.
      const next = base.overlay === combineId || combineId === base.effect ? undefined : combineId
      return { ...prev, [id]: { ...base, overlay: next } }
    })
  }, [])
  const setLook = useCallback((id: string, lookSwitch: boolean) => {
    setConfigs((prev) => {
      const base = prev[id] ?? { role: DEFAULT_CAMERA_ROLE, effect: 'camera' }
      return { ...prev, [id]: { ...base, lookSwitch } }
    })
  }, [])
  const setPriority = useCallback((id: string, priority: number) => {
    setConfigs((prev) => {
      const base = prev[id] ?? { role: DEFAULT_CAMERA_ROLE, effect: 'camera' }
      return { ...prev, [id]: { ...base, priority } }
    })
  }, [])
  const onTileClick = useCallback((id: string) => {
    setFocused(id)
    if (!autoRef.current) {
      manualIdRef.current = id
      setProgramId(id)
    }
  }, [])

  const midiNoteFor = (action: CamMidiAction): number | null => {
    const entry = Object.entries(camMidi).find(([, a]) => sameMidiAction(a, action))
    return entry ? Number(entry[0]) : null
  }
  const bindCamMidi = (note: number, action: CamMidiAction): void => {
    setCamMidi((prev) => {
      const next: Record<number, CamMidiAction> = {}
      for (const [n, a] of Object.entries(prev)) {
        if (Number(n) === note) continue // this note is being reassigned
        if (sameMidiAction(a, action)) continue // move this action off its old note
        next[Number(n)] = a
      }
      next[note] = action
      return next
    })
  }
  const clearCamMidi = (action: CamMidiAction): void => {
    setCamMidi((prev) => {
      const next: Record<number, CamMidiAction> = {}
      for (const [n, a] of Object.entries(prev)) if (!sameMidiAction(a, action)) next[Number(n)] = a
      return next
    })
  }
  const learnCamMidi = (action: CamMidiAction): void => {
    if (midiLearn && sameMidiAction(midiLearn, action)) {
      midiPads.cancelLearn()
      setMidiLearn(null)
      return
    }
    setMidiLearn(action)
    void midiPads.ensureStarted()
    midiPads.learnOnce((note) => {
      bindCamMidi(note, action)
      setMidiLearn(null)
    })
  }
  const midiRow = (name: string, action: CamMidiAction): JSX.Element => {
    const note = midiNoteFor(action)
    const learning = !!midiLearn && sameMidiAction(midiLearn, action)
    return (
      <div className="cam-midi-row" key={action.kind === 'cut' ? action.deviceId : 'auto'}>
        <span className="cam-midi-name">{name}</span>
        <button
          className={`cam-midi-learn${learning ? ' learning' : ''}`}
          onClick={() => learnCamMidi(action)}
        >
          {learning ? 'Press a pad…' : note != null ? `Note ${note}` : 'Learn'}
        </button>
        {note != null && !learning && (
          <button className="cam-midi-clear" onClick={() => clearCamMidi(action)} title="Clear binding">
            ✕
          </button>
        )}
      </div>
    )
  }

  const focusedEffect = focused ? getConfig(focused).effect : 'camera'
  const focusedOverlay = focused ? getConfig(focused).overlay : ''
  const activeVisual = getVisual(focusedEffect)
  const tracksBody = activeVisual.needsPose || activeVisual.needsFace || showSkeleton || showFaceMesh
  const activeParams = useMemo(
    () => ({ ...defaultParams(activeVisual), ...(fxParams[focusedEffect] ?? {}) }),
    [activeVisual, fxParams, focusedEffect]
  )
  const setParam = useCallback(
    (key: string, value: number) =>
      setFxParams((prev) => ({
        ...prev,
        [focusedEffect]: {
          ...defaultParams(activeVisual),
          ...(prev[focusedEffect] ?? {}),
          [key]: value
        }
      })),
    [activeVisual, focusedEffect]
  )
  const cameraFx = VISUALS.filter((v) => v.usesCamera)
  const genFx = VISUALS.filter((v) => !v.usesCamera)
  const fxButton = (v: VisualModule): JSX.Element => {
    const isBase = focusedEffect === v.id
    const isOverlay = focusedOverlay === v.id
    return (
      <button
        key={v.id}
        className={`cam-fx-btn${isBase ? ' active' : ''}${isOverlay ? ' overlay' : ''}`}
        onClick={(e) => {
          if (!focused) return
          if (e.shiftKey) setCombine(focused, v.id)
          else setEffect(focused, v.id)
        }}
        disabled={!focused}
        title={
          isOverlay
            ? 'Overlay layer. Shift+click to remove.'
            : 'Click to set. Shift+click to combine as an overlay.'
        }
      >
        {v.name}
        {(v.needsPose || v.needsFace) && <span className="cam-fx-tag">body</span>}
        {isOverlay && <span className="cam-fx-tag combine">＋</span>}
      </button>
    )
  }

  // Collage grid dimensions; when a trailing cell is spare, the live final cut
  // fills the bottom-right (e.g. 3 cameras -> 2x2 with the program in cell 4).
  const { cols, rows } = collageDims(enabled.length)
  const showProgramCell = enabled.length >= 2 && cols * rows > enabled.length

  return (
    <div className={`view camera-view${embedded ? ' camera-view--embedded' : ''}`}>
      {!embedded && (
        <div className="view-header">
          <h1>Camera</h1>
          <p className="view-sub">
            Live cameras with per-camera roles and effects. The auto-director cuts the recording
            between cameras; each camera can carry its own effect, or none.
          </p>
        </div>
      )}

      <div className="camera-layout">
        {(!embedded || camGear) && (
        <aside className={`camera-side${embedded ? ' camera-drawer' : ''}`}>
          {embedded && (
            <div className="camera-drawer-head">
              <strong>Camera setup</strong>
              <button className="cam-icon-btn" title="Close" onClick={() => setCamGear(false)}>
                ✕
              </button>
            </div>
          )}
          <div className="cam-cameras-head">
            <h3>Cameras</h3>
            {enabled.length > 0 && (
              <button
                className="cam-clear-btn"
                title="Turn off all cameras (start fresh, then add them one by one)"
                onClick={() => {
                  setEnabled([])
                  setProgramId(null)
                  manualIdRef.current = null
                }}
              >
                Remove all
              </button>
            )}
          </div>
          {needsPermission ? (
            <button className="primary-button" onClick={requestPermission}>
              Allow camera access
            </button>
          ) : devices.length === 0 ? (
            <p className="settings-hint">No cameras found. Connect one and it will appear here.</p>
          ) : (
            <div className="cam-device-list">
              {devices.map((d, i) => {
                const on = enabled.includes(d.deviceId)
                const cfg = getConfig(d.deviceId)
                return (
                  <div key={d.deviceId} className={`cam-device${on ? ' on' : ''}`}>
                    <label className="cam-device-head">
                      <input type="checkbox" checked={on} onChange={() => toggle(d.deviceId)} />
                      <span className="cam-device-name">{d.label || `Camera ${i + 1}`}</span>
                    </label>
                    {on && (
                      <div className="cam-device-cfg">
                        <select
                          className="cam-role-select"
                          value={cfg.role}
                          onChange={(e) => setRole(d.deviceId, e.target.value as CameraRole)}
                          title="What this camera is pointed at (drives auto-switching)"
                        >
                          {CAMERA_ROLES.map((r) => (
                            <option key={r.role} value={r.role}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <select
                          className="cam-effect-select"
                          value={cfg.effect}
                          onChange={(e) => setEffect(d.deviceId, e.target.value)}
                          title="Effect drawn on this camera (None = plain feed)"
                        >
                          <option value="camera">No effect</option>
                          {VISUALS.filter((v) => v.id !== 'camera').map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {status && <p className="settings-hint">{status}</p>}

          <h3 style={{ marginTop: 8 }}>Auto-director</h3>
          <label className="cam-out-row">
            <span>Auto-switch recording</span>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          </label>
          <p className="settings-hint">
            {auto
              ? 'The director cuts the recording between cameras by role, framing, and the music. The laptop cam is only used when you turn to the decks.'
              : 'Manual: click a camera tile to cut the recording to it.'}
          </p>
          {enabled.length > 0 && (
            <div className="cam-midi">
              {enabled.map((id) =>
                midiRow(`Cut to ${devices.find((d) => d.deviceId === id)?.label || 'camera'}`, {
                  kind: 'cut',
                  deviceId: id
                })
              )}
              {midiRow('Toggle auto-director', { kind: 'auto' })}
              <p className="settings-hint">
                Learn a pad for each. A pad-cut takes over from auto until you re-enable it.
              </p>
            </div>
          )}

          <h3 style={{ marginTop: 8 }}>Output (background)</h3>
          <button className={`cam-output-btn${outputOpen ? ' active' : ''}`} onClick={toggleOutput}>
            {outputOpen ? 'Close projector output' : 'Open projector output'}
          </button>
          <p className="settings-hint">
            Full-screen on a second display (projector / stage TV). This screen bus is separate
            from what you record.
          </p>

          <label className="cam-out-row">
            <span>Show</span>
            <select value={outMode} onChange={(e) => putOut(MODE_KEY, e.target.value, setOutMode)}>
              <option value="camera">Camera effect</option>
              <option value="screen">Stage screen (lighting)</option>
            </select>
          </label>

          {outMode === 'screen' && (
            <>
              <label className="cam-out-row">
                <span>Look</span>
                <select
                  value={screenLook}
                  onChange={(e) => putOut(LOOK_KEY, e.target.value, setScreenLook)}
                >
                  <option value="flat">Flat fill</option>
                  <option value="radial">Radial / circular</option>
                </select>
              </label>
              <label className="cam-out-row">
                <span>Color from</span>
                <select
                  value={screenSource}
                  onChange={(e) => putOut(SOURCE_KEY, e.target.value, setScreenSource)}
                >
                  <option value="auto">Whole rig (average)</option>
                  {screens.map((s) => (
                    <option key={s.patchId} value={s.patchId}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cam-out-row">
                <span>Overlay FX</span>
                <select
                  value={overlay}
                  onChange={(e) => putOut(OVERLAY_KEY, e.target.value, setOverlay)}
                >
                  <option value="none">None</option>
                  {VISUALS.filter((v) => v.id !== 'camera').map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              {overlay !== 'none' && (
                <label className="cam-out-row">
                  <span>Overlay mix</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={overlayOp}
                    onChange={(e) => {
                      setOverlayOp(Number(e.target.value))
                      localStorage.setItem(OVERLAY_OP_KEY, e.target.value)
                    }}
                  />
                </label>
              )}
              {screens.length === 0 && (
                <p className="settings-hint">
                  Tip: patch a &quot;TV / LED Screen&quot; fixture in Lighting Setup to drive a
                  specific screen; otherwise the whole-rig color is used.
                </p>
              )}
            </>
          )}

          <h3 style={{ marginTop: 8 }}>Recording</h3>
          <p className="settings-hint">
            Records the live program (the auto-switched / selected camera), not the screen bus.
          </p>
          <RecordingPanel getCanvas={() => programCanvasRef.current} />

          <h3 style={{ marginTop: 8 }}>Testing Purposes / Beta Features</h3>
          <label className="cam-device-head">
            <input
              type="checkbox"
              checked={showSkeleton}
              onChange={(e) => setShowSkeleton(e.target.checked)}
            />
            <span>Skeleton + face dots overlay</span>
          </label>
          <label className="cam-device-head">
            <input
              type="checkbox"
              checked={showFaceMesh}
              onChange={(e) => setShowFaceMesh(e.target.checked)}
            />
            <span>Face mesh overlay</span>
          </label>
          <div className="cam-testing-meters">
            <Meter label="Present" value={feat.present} />
            <Meter label="Hands up" value={feat.handsUp} />
            <Meter label="Arm spread" value={feat.armSpread} />
            <Meter label="Motion" value={feat.motion} />
            <Meter label="Jump" value={feat.jump} />
          </div>
          {!tracksBody && (
            <p className="settings-hint">
              Turn on an overlay above (or pick Neon Stickman) to see these move.
            </p>
          )}
        </aside>
        )}

        <div className="camera-main">
          {embedded && (
            <div className="operator-cam-topbar">
              <label className="cam-out-row cam-auto-row">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                <span>Director Mode</span>
              </label>
              <span
                className="cam-help"
                title="Beta. When on, the recording auto-cuts between your cameras by role, framing, priority, and the music. Tune it with the gear. It doesn't change what's on the live screen."
              >
                ?
              </span>
              <button
                className="cam-icon-btn"
                title="Director settings (how it cuts, on-beat, drop effect, camera frame)"
                onClick={() => setDirectorOpen(true)}
              >
                ⚙
              </button>
              <button
                className={`cam-icon-btn${camGear ? ' active' : ''}`}
                title="Camera setup (roles, effects, screen output, MIDI)"
                onClick={() => setCamGear((v) => !v)}
              >
                ☰
              </button>
            </div>
          )}
          <div className="camera-stage">
            {enabled.length === 0 ? (
              <div className="camera-empty">Enable a camera to preview it here.</div>
            ) : (
              <div
                className="cam-grid cam-collage"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
                }}
              >
                {enabled.map((id) => {
                  const cfg = getConfig(id)
                  // On a beat drop, the program camera temporarily wears the
                  // chosen drop effect instead of its own.
                  const effect =
                    dropFx && programId === id && auto ? dropFx.effect : cfg.effect
                  const combineId = cfg.overlay && cfg.overlay !== effect ? cfg.overlay : ''
                  return (
                    <CameraTile
                      key={id}
                      deviceId={id}
                      role={cfg.role}
                      effect={effect}
                      overlay={combineId}
                      params={{
                        ...defaultParams(getVisual(effect)),
                        ...(fxParams[effect] ?? {})
                      }}
                      overlayParams={
                        combineId
                          ? { ...defaultParams(getVisual(combineId)), ...(fxParams[combineId] ?? {}) }
                          : {}
                      }
                      fit={display.fit}
                      program={programId === id}
                      focused={focused === id}
                      detectFraming={auto}
                      recordCanvas={programId === id ? recCanvasEl : null}
                      recordAspect={ASPECTS.find((a) => a.id === display.aspect)?.ratio ?? null}
                      showSkeleton={showSkeleton}
                      showFaceMesh={showFaceMesh}
                      beatRef={beatRef}
                      audioRef={audioRef}
                      lightRef={lightRef}
                      onFraming={(f, face, luma) => onFraming(id, f, face, luma)}
                      onFeatures={onFeatures}
                      onStatus={setStatus}
                      onClick={() => onTileClick(id)}
                    />
                  )
                })}
                {/* Spare bottom-right cell shows the live final cut. */}
                {showProgramCell && (
                  <button
                    className="cam-tile cam-program-cell"
                    style={{ gridColumn: cols, gridRow: rows }}
                    title="Final cut (what's being recorded). Click to enlarge."
                    onClick={() => setProgramBig(true)}
                  >
                    <canvas ref={programPreviewRef} className="cam-program-cell-canvas" />
                    <span className="cam-badge program">● PROGRAM</span>
                  </button>
                )}
              </div>
            )}
            {/* Hidden full-res record canvas - authored by the program tile. */}
            <canvas ref={setProgramCanvas} className="cam-program-hidden" />
            {/* Floating final-cut preview, only when the grid has no spare cell
                for it (otherwise the program lives in the collage cell above). */}
            {enabled.length >= 2 && !showProgramCell && (
              <button
                className="cam-program-preview"
                title="Final cut (what's being recorded). Click to enlarge."
                onClick={() => setProgramBig(true)}
              >
                <canvas ref={programPreviewRef} className="cam-program-preview-canvas" />
                <span className="cam-program-preview-tag">● PGM</span>
              </button>
            )}
          </div>

          <div className="cam-hud">
            <div className="cam-hud-target">
              {focused
                ? `Effect for: ${devices.find((d) => d.deviceId === focused)?.label || 'selected camera'} (${ROLE_LABEL[getConfig(focused).role]})`
                : 'Select a camera tile to set its effect'}
              {focused && (
                <span className="cam-hud-hint">
                  {focusedOverlay
                    ? ` — combined: ${getVisual(focusedEffect).name} ＋ ${getVisual(focusedOverlay).name} (shift+click to change)`
                    : ' — shift+click a second effect to combine'}
                </span>
              )}
            </div>
            <div className="cam-fx-group">
              <span className="cam-hud-label">Camera</span>
              {cameraFx.map(fxButton)}
            </div>
            <div className="cam-fx-group">
              <span className="cam-hud-label">Generative</span>
              {genFx.map(fxButton)}
            </div>
          </div>

          {activeVisual.params && activeVisual.params.length > 0 && (
            <div className="cam-fx-settings">
              <span className="cam-hud-label">{activeVisual.name} settings</span>
              {activeVisual.params.map((p) => {
                const val = activeParams[p.key] ?? p.default
                return (
                  <label key={p.key} className="cam-fx-param">
                    <span className="cam-fx-param-label">{p.label}</span>
                    <input
                      type="range"
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      value={val}
                      onChange={(e) => setParam(p.key, Number(e.target.value))}
                    />
                    <span className="cam-fx-param-val">{val.toFixed(2)}</span>
                  </label>
                )
              })}
            </div>
          )}

          {embedded && (
            <div className="operator-cam-record">
              <span className="cam-hud-label">Record</span>
              <RecordingPanel getCanvas={() => programCanvasRef.current} />
            </div>
          )}
        </div>
      </div>

      {directorOpen && (
        <DirectorSettingsPanel
          settings={director}
          onChange={setDirector}
          cameras={enabled.map((id) => {
            const cfg = getConfig(id)
            return {
              deviceId: id,
              label: devices.find((d) => d.deviceId === id)?.label || 'Camera',
              role: cfg.role,
              lookSwitch: cfg.lookSwitch,
              priority: cfg.priority
            }
          })}
          onLookSwitch={setLook}
          onPriority={setPriority}
          onAllEqual={() =>
            setConfigs((prev) => {
              const next: Record<string, CameraConfig> = {}
              for (const [k, v] of Object.entries(prev)) next[k] = { ...v, priority: 1 }
              return next
            })
          }
          effectOptions={VISUALS.filter((v) => v.id !== 'camera').map((v) => ({
            id: v.id,
            name: v.name
          }))}
          display={display}
          onDisplay={setDisplay}
          aspects={ASPECTS.map((a) => ({ id: a.id, label: a.label }))}
          onClose={() => setDirectorOpen(false)}
        />
      )}

      {programBig && (
        <div className="cam-program-modal" onClick={() => setProgramBig(false)}>
          <div className="cam-program-modal-inner" onClick={(e) => e.stopPropagation()}>
            <div className="cam-program-modal-bar">
              <span className="cam-program-modal-title">● Final cut (recording source)</span>
              <button className="cam-icon-btn" title="Close" onClick={() => setProgramBig(false)}>
                ✕
              </button>
            </div>
            <canvas ref={programBigRef} className="cam-program-modal-canvas" />
          </div>
        </div>
      )}
    </div>
  )
}
