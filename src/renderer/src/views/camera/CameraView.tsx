import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { CameraCanvas, ZERO_FEAT, ZERO_AUDIO } from '../../camera/CameraCanvas'
import { VISUALS, getVisual, defaultParams, type AudioReact, type VisualModule } from '../../camera/VisualEngine'
import type { PoseFeatureState } from '../../camera/PoseFeatures'
import { RecordingPanel } from './RecordingPanel'
import './CameraView.css'

const STORE_KEY = 'djc.camera.enabled'
const VISUAL_KEY = 'djc.camera.visual'
const PRIMARY_KEY = 'djc.camera.primary'
const FX_KEY = 'djc.camera.fx'

type FxParams = Record<string, Record<string, number>>

/** One live camera tile wrapping the shared canvas. */
function CameraTile({
  deviceId,
  primary,
  visualId,
  params,
  showSkeleton,
  showFaceMesh,
  beatRef,
  audioRef,
  onFeatures,
  onStatus,
  onCanvasReady
}: {
  deviceId: string
  primary: boolean
  visualId: string
  params: Record<string, number>
  showSkeleton: boolean
  showFaceMesh: boolean
  beatRef: React.MutableRefObject<number>
  audioRef: React.MutableRefObject<AudioReact>
  onFeatures?: (f: PoseFeatureState) => void
  onStatus?: (s: string) => void
  onCanvasReady?: (el: HTMLCanvasElement | null) => void
}): JSX.Element {
  return (
    <div className="cam-tile">
      <CameraCanvas
        deviceId={deviceId}
        visualId={visualId}
        params={params}
        showSkeleton={primary && showSkeleton}
        showFaceMesh={primary && showFaceMesh}
        beatRef={beatRef}
        audioRef={audioRef}
        onFeatures={primary ? onFeatures : undefined}
        onStatus={onStatus}
        onCanvasReady={primary ? onCanvasReady : undefined}
      />
      {primary && <span className="cam-badge">Effect</span>}
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

export function CameraView(): JSX.Element {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [enabled, setEnabled] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const [primary, setPrimary] = useState<string | null>(() => localStorage.getItem(PRIMARY_KEY))
  const [visual, setVisual] = useState<string>(() => localStorage.getItem(VISUAL_KEY) ?? 'camera')
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
  const beatRef = useRef(0)
  const audioRef = useRef<AudioReact>({ ...ZERO_AUDIO })
  const primaryCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const setPrimaryCanvas = useCallback((el: HTMLCanvasElement | null) => {
    primaryCanvasRef.current = el
  }, [])

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

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(enabled))
    if (primary && !enabled.includes(primary)) setPrimary(enabled[0] ?? null)
    if (!primary && enabled.length > 0) setPrimary(enabled[0])
  }, [enabled, primary])

  useEffect(() => localStorage.setItem(VISUAL_KEY, visual), [visual])
  useEffect(() => localStorage.setItem(FX_KEY, JSON.stringify(fxParams)), [fxParams])
  useEffect(() => {
    if (primary) localStorage.setItem(PRIMARY_KEY, primary)
  }, [primary])

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
  const activeVisual = getVisual(visual)
  const tracksBody = activeVisual.needsPose || activeVisual.needsFace || showSkeleton || showFaceMesh
  const activeParams = useMemo(
    () => ({ ...defaultParams(activeVisual), ...(fxParams[visual] ?? {}) }),
    [activeVisual, fxParams, visual]
  )
  const setParam = useCallback(
    (key: string, value: number) =>
      setFxParams((prev) => ({
        ...prev,
        [visual]: { ...defaultParams(activeVisual), ...(prev[visual] ?? {}), [key]: value }
      })),
    [activeVisual, visual]
  )
  const cameraFx = VISUALS.filter((v) => v.usesCamera)
  const genFx = VISUALS.filter((v) => !v.usesCamera)
  const fxButton = (v: VisualModule): JSX.Element => (
    <button
      key={v.id}
      className={`cam-fx-btn${visual === v.id ? ' active' : ''}`}
      onClick={() => setVisual(v.id)}
    >
      {v.name}
      {(v.needsPose || v.needsFace) && <span className="cam-fx-tag">body</span>}
    </button>
  )

  return (
    <div className="view camera-view">
      <div className="view-header">
        <h1>Camera</h1>
        <p className="view-sub">
          Live cameras, body detection, and visual effects. Effects run on the primary camera and
          react to your movement and the music.
        </p>
      </div>

      <div className="camera-layout">
        <aside className="camera-side">
          <h3>Cameras</h3>
          {needsPermission ? (
            <button className="primary-button" onClick={requestPermission}>
              Allow camera access
            </button>
          ) : devices.length === 0 ? (
            <p className="settings-hint">No cameras found. Connect one and it will appear here.</p>
          ) : (
            <div className="cam-device-list">
              {devices.map((d, i) => (
                <label key={d.deviceId} className="cam-device">
                  <input type="checkbox" checked={enabled.includes(d.deviceId)} onChange={() => toggle(d.deviceId)} />
                  <span className="cam-device-name">{d.label || `Camera ${i + 1}`}</span>
                  {enabled.includes(d.deviceId) && (
                    <button
                      className={`cam-primary-btn${primary === d.deviceId ? ' active' : ''}`}
                      title="Run the effect on this camera"
                      onClick={() => setPrimary(d.deviceId)}
                    >
                      {primary === d.deviceId ? 'Primary' : 'Set primary'}
                    </button>
                  )}
                </label>
              ))}
            </div>
          )}
          {status && <p className="settings-hint">{status}</p>}

          <h3 style={{ marginTop: 8 }}>Output (background)</h3>
          <button className={`cam-output-btn${outputOpen ? ' active' : ''}`} onClick={toggleOutput}>
            {outputOpen ? 'Close projector output' : 'Open projector output'}
          </button>
          <p className="settings-hint">
            Sends the current effect full-screen to a second display (projector / stage TV).
          </p>

          <h3 style={{ marginTop: 8 }}>Recording</h3>
          <RecordingPanel getCanvas={() => primaryCanvasRef.current} />

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

        <div className="camera-main">
          <div className="camera-stage">
            {enabled.length === 0 ? (
              <div className="camera-empty">Enable a camera to preview it here.</div>
            ) : (
              <div className={`cam-grid count-${Math.min(enabled.length, 4)}`}>
                {enabled.map((id) => (
                  <CameraTile
                    key={id}
                    deviceId={id}
                    primary={primary === id}
                    visualId={primary === id ? visual : 'camera'}
                    params={primary === id ? activeParams : {}}
                    showSkeleton={showSkeleton}
                    showFaceMesh={showFaceMesh}
                    beatRef={beatRef}
                    audioRef={audioRef}
                    onFeatures={onFeatures}
                    onStatus={setStatus}
                    onCanvasReady={setPrimaryCanvas}
                  />
                ))}
              </div>
            )}
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
        </div>
      </div>
    </div>
  )
}
