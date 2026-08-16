import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { CameraCanvas, ZERO_FEAT, ZERO_AUDIO } from '../../camera/CameraCanvas'
import { VISUALS, getVisual, defaultParams, type AudioReact, type VisualModule } from '../../camera/VisualEngine'
import type { PoseFeatureState } from '../../camera/PoseFeatures'
import type { FaceFrame } from '../../camera/FaceEngine'
import { framingSignal } from '../../camera/framing'
import { CameraDirector, type CameraSignal } from '@core/camera/CameraDirector'
import { CAMERA_ROLES, DEFAULT_CAMERA_ROLE, type CameraRole } from '@core/camera/roles'
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
const MODE_KEY = 'djc.output.mode'
const LOOK_KEY = 'djc.output.screenLook'
const SOURCE_KEY = 'djc.output.screenSource'
const OVERLAY_KEY = 'djc.output.overlay'
const OVERLAY_OP_KEY = 'djc.output.overlayOpacity'

type FxParams = Record<string, Record<string, number>>
type ScreenInfo = { patchId: string; label: string }
type CameraConfig = { role: CameraRole; effect: string }
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
  params,
  program,
  focused,
  showSkeleton,
  showFaceMesh,
  beatRef,
  audioRef,
  lightRef,
  onFraming,
  onFeatures,
  onStatus,
  onCanvasReady,
  onClick
}: {
  deviceId: string
  role: CameraRole
  effect: string
  params: Record<string, number>
  program: boolean
  focused: boolean
  showSkeleton: boolean
  showFaceMesh: boolean
  beatRef: React.MutableRefObject<number>
  audioRef: React.MutableRefObject<AudioReact>
  lightRef: React.MutableRefObject<{ r: number; g: number; b: number }>
  onFraming: (feat: PoseFeatureState, face: FaceFrame | null) => void
  onFeatures?: (f: PoseFeatureState) => void
  onStatus?: (s: string) => void
  onCanvasReady: (el: HTMLCanvasElement | null) => void
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
        params={params}
        showSkeleton={focused && showSkeleton}
        showFaceMesh={focused && showFaceMesh}
        detectFraming
        framingNeedsFace={role === 'headon' || role === 'laptop'}
        beatRef={beatRef}
        audioRef={audioRef}
        lightRef={lightRef}
        onFraming={onFraming}
        onFeatures={focused ? onFeatures : undefined}
        onStatus={onStatus}
        onCanvasReady={onCanvasReady}
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
  const tileCanvases = useRef<Record<string, HTMLCanvasElement | null>>({})
  const programCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const programIdRef = useRef<string | null>(null)
  const enabledRef = useRef<string[]>([])
  const configsRef = useRef<Record<string, CameraConfig>>({})
  const autoRef = useRef(false)
  const manualIdRef = useRef<string | null>(null)
  const camMidiRef = useRef<Record<number, CamMidiAction>>({})
  programIdRef.current = programId
  autoRef.current = auto
  camMidiRef.current = camMidi

  const getConfig = useCallback(
    (id: string): CameraConfig => configs[id] ?? { role: DEFAULT_CAMERA_ROLE, effect: 'camera' },
    [configs]
  )

  const refresh = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      const cams = list.filter((d) => d.kind === 'videoinput')
      setDevices(cams)
      if (cams.length > 0 && cams[0].label) setNeedsPermission(false)
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
      } catch {
        /* lighting not ready */
      }
    }, 45)
    return () => clearInterval(id)
  }, [])

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
          next[id] = { role: i === 0 ? 'headon' : 'other', effect: 'camera' }
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
      const signals: CameraSignal[] = ids.map(
        (cid) =>
          framingsRef.current[cid] ?? {
            id: cid,
            role: configsRef.current[cid]?.role ?? 'other',
            present: 0,
            motion: 0,
            facing: 0,
            lookingAtBoard: 0
          }
      )
      const dec = director.update(signals, {
        nowMs: performance.now(),
        audioLevel: audioRef.current.level,
        surge: audioRef.current.surge
      })
      setProgramId((p) => (p === dec.activeId ? p : dec.activeId))
    }, 200)
    return () => clearInterval(id)
  }, [])

  // Program compositor: copy the active camera's canvas into one canvas so
  // recording follows the auto-switch without restarting the recorder.
  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      raf = requestAnimationFrame(loop)
      const dst = programCanvasRef.current
      const src = programIdRef.current ? tileCanvases.current[programIdRef.current] : null
      if (!dst || !src || src.width === 0) return
      if (dst.width !== src.width || dst.height !== src.height) {
        dst.width = src.width
        dst.height = src.height
      }
      const ctx = dst.getContext('2d')
      if (ctx) ctx.drawImage(src, 0, 0)
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
  const registerCanvas = useCallback((id: string, el: HTMLCanvasElement | null) => {
    tileCanvases.current[id] = el
  }, [])
  const onFraming = useCallback(
    (id: string, f: PoseFeatureState, face: FaceFrame | null) => {
      const role = configsRef.current[id]?.role ?? 'other'
      framingsRef.current[id] = framingSignal(id, role, f, face)
    },
    []
  )
  const setRole = useCallback((id: string, role: CameraRole) => {
    setConfigs((prev) => ({ ...prev, [id]: { role, effect: prev[id]?.effect ?? 'camera' } }))
  }, [])
  const setEffect = useCallback((id: string, effect: string) => {
    setConfigs((prev) => ({
      ...prev,
      [id]: { role: prev[id]?.role ?? DEFAULT_CAMERA_ROLE, effect }
    }))
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
  const fxButton = (v: VisualModule): JSX.Element => (
    <button
      key={v.id}
      className={`cam-fx-btn${focusedEffect === v.id ? ' active' : ''}`}
      onClick={() => focused && setEffect(focused, v.id)}
      disabled={!focused}
    >
      {v.name}
      {(v.needsPose || v.needsFace) && <span className="cam-fx-tag">body</span>}
    </button>
  )

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
          <h3>Cameras</h3>
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

          <h3 style={{ marginTop: 8 }}>Body features</h3>
          <Meter label="Present" value={feat.present} />
          <Meter label="Hands up" value={feat.handsUp} />
          <Meter label="Arm spread" value={feat.armSpread} />
          <Meter label="Motion" value={feat.motion} />
          <Meter label="Hand pulse" value={feat.handPulse} />
          <Meter label="Jump" value={feat.jump} />
          {!tracksBody && (
            <p className="settings-hint">
              Pick a body effect (Neon Stickman) or a debug overlay to see these move.
            </p>
          )}
        </aside>
        )}

        <div className="camera-main">
          {embedded && (
            <div className="operator-cam-topbar">
              <label className="cam-out-row cam-auto-row">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                <span>Auto-switch cameras</span>
              </label>
              <button
                className={`cam-icon-btn${camGear ? ' active' : ''}`}
                title="Camera setup (roles, effects, screen output, MIDI)"
                onClick={() => setCamGear((v) => !v)}
              >
                ⚙
              </button>
            </div>
          )}
          <div className="camera-stage">
            {enabled.length === 0 ? (
              <div className="camera-empty">Enable a camera to preview it here.</div>
            ) : (
              <div className={`cam-grid count-${Math.min(enabled.length, 4)}`}>
                {enabled.map((id) => {
                  const cfg = getConfig(id)
                  return (
                    <CameraTile
                      key={id}
                      deviceId={id}
                      role={cfg.role}
                      effect={cfg.effect}
                      params={{
                        ...defaultParams(getVisual(cfg.effect)),
                        ...(fxParams[cfg.effect] ?? {})
                      }}
                      program={programId === id}
                      focused={focused === id}
                      showSkeleton={showSkeleton}
                      showFaceMesh={showFaceMesh}
                      beatRef={beatRef}
                      audioRef={audioRef}
                      lightRef={lightRef}
                      onFraming={(f, face) => onFraming(id, f, face)}
                      onFeatures={onFeatures}
                      onStatus={setStatus}
                      onCanvasReady={(el) => registerCanvas(id, el)}
                      onClick={() => onTileClick(id)}
                    />
                  )
                })}
              </div>
            )}
            {/* Hidden program compositor - the recording source. */}
            <canvas ref={programCanvasRef} className="cam-program-hidden" />
            {enabled.length > 0 && (
              <div className="cam-debug">
                <label className="cam-debug-toggle">
                  <input type="checkbox" checked={showSkeleton} onChange={(e) => setShowSkeleton(e.target.checked)} />
                  Show skeleton
                </label>
                <label className="cam-debug-toggle">
                  <input type="checkbox" checked={showFaceMesh} onChange={(e) => setShowFaceMesh(e.target.checked)} />
                  Show face mesh
                </label>
              </div>
            )}
          </div>

          <div className="cam-hud">
            <div className="cam-hud-target">
              {focused
                ? `Effect for: ${devices.find((d) => d.deviceId === focused)?.label || 'selected camera'} (${ROLE_LABEL[getConfig(focused).role]})`
                : 'Select a camera tile to set its effect'}
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
    </div>
  )
}
