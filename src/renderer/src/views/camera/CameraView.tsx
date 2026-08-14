import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { PoseEngine } from '../../camera/PoseEngine'
import { PoseFeatures, type PoseFeatureState } from '../../camera/PoseFeatures'
import { VISUALS, getVisual, type VisualInput } from '../../camera/VisualEngine'
import './CameraView.css'

const STORE_KEY = 'djc.camera.enabled'
const VISUAL_KEY = 'djc.camera.visual'

const ZERO_FEAT: PoseFeatureState = {
  present: 0,
  handsUp: 0,
  armSpread: 0,
  motion: 0,
  handPulse: 0,
  centerX: 0.5,
  centerY: 0.5
}

/** One live camera tile: hidden <video> source, visible <canvas> rendering the
 *  active visual. The primary tile runs pose detection + the chosen effect. */
function CameraTile({
  deviceId,
  primary,
  visualId,
  detectOn,
  beatRef,
  onFeatures,
  onStatus
}: {
  deviceId: string
  primary: boolean
  visualId: string
  detectOn: boolean
  beatRef: React.MutableRefObject<number>
  onFeatures?: (f: PoseFeatureState) => void
  onStatus?: (s: string) => void
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const visualIdRef = useRef(visualId)
  const detectOnRef = useRef(detectOn)
  visualIdRef.current = visualId
  detectOnRef.current = detectOn

  // Capture the camera stream into the hidden video element.
  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    const attach = (s: MediaStream): void => {
      if (cancelled) return s.getTracks().forEach((t) => t.stop())
      stream = s
      if (videoRef.current) {
        videoRef.current.srcObject = s
        void videoRef.current.play()
      }
    }
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then(attach)
      .catch(() =>
        navigator.mediaDevices
          .getUserMedia({ video: true, audio: false })
          .then(attach)
          .catch((err) => onStatus?.(`Camera unavailable: ${err?.name ?? err}`))
      )
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [deviceId, onStatus])

  // Render loop: draw the active visual; lazily load pose detection when needed.
  useEffect(() => {
    let raf = 0
    const features = new PoseFeatures(30)
    let engine: PoseEngine | null = null
    let engineLoading = false
    let lastFeat = ZERO_FEAT

    const loop = (): void => {
      raf = requestAnimationFrame(loop)
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!canvas) return
      const w = canvas.clientWidth || 640
      const h = canvas.clientHeight || 360
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      let pose = null
      if (detectOnRef.current) {
        if (!engine && !engineLoading) {
          engineLoading = true
          onStatus?.('Loading detection model…')
          engine = new PoseEngine()
          engine
            .init()
            .then(() => onStatus?.(''))
            .catch((err) => onStatus?.(`Detection failed: ${err?.message ?? err}`))
        }
        if (engine?.ready && video && video.readyState >= 2) {
          pose = engine.detect(video, performance.now())
          if (pose) {
            lastFeat = features.addFrame(pose)
            onFeatures?.(lastFeat)
          }
        }
      }

      const input: VisualInput = {
        video,
        pose,
        features: lastFeat,
        timeMs: performance.now(),
        beatPhase: beatRef.current,
        audio: Math.max(lastFeat.motion, lastFeat.handPulse),
        w,
        h
      }
      getVisual(visualIdRef.current).render(ctx, input)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      engine?.close()
    }
  }, [beatRef, onFeatures, onStatus])

  return (
    <div className="cam-tile">
      <video ref={videoRef} className="cam-video-hidden" muted playsInline />
      <canvas ref={canvasRef} className="cam-canvas" />
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
  const [primary, setPrimary] = useState<string | null>(null)
  const [visual, setVisual] = useState<string>(() => localStorage.getItem(VISUAL_KEY) ?? 'camera')
  const [feat, setFeat] = useState<PoseFeatureState>(ZERO_FEAT)
  const [status, setStatus] = useState('')
  const [needsPermission, setNeedsPermission] = useState(true)
  const beatRef = useRef(0)

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

  // Poll the lighting clock so visuals stay beat-synced with the music.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const s = await window.djCompanion.lighting.getStatus()
        beatRef.current = s.beatPhase ?? 0
      } catch {
        /* lighting not ready */
      }
    }, 60)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(enabled))
    if (primary && !enabled.includes(primary)) setPrimary(enabled[0] ?? null)
    if (!primary && enabled.length > 0) setPrimary(enabled[0])
  }, [enabled, primary])

  useEffect(() => localStorage.setItem(VISUAL_KEY, visual), [visual])

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

  const toggle = (id: string): void =>
    setEnabled((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const onFeatures = useCallback((f: PoseFeatureState) => setFeat({ ...f }), [])
  const activeVisual = getVisual(visual)
  const detectPrimary = activeVisual.needsPerson

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

          <h3 style={{ marginTop: 8 }}>Body features</h3>
          <Meter label="Present" value={feat.present} />
          <Meter label="Hands up" value={feat.handsUp} />
          <Meter label="Arm spread" value={feat.armSpread} />
          <Meter label="Motion" value={feat.motion} />
          <Meter label="Hand pulse" value={feat.handPulse} />
          {!detectPrimary && (
            <p className="settings-hint">Pick a body effect (Wireframe / Geometric) to see these move.</p>
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
                    detectOn={primary === id && detectPrimary}
                    beatRef={beatRef}
                    onFeatures={onFeatures}
                    onStatus={setStatus}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="cam-hud">
            <span className="cam-hud-label">Effect</span>
            {VISUALS.map((v) => (
              <button
                key={v.id}
                className={`cam-fx-btn${visual === v.id ? ' active' : ''}`}
                onClick={() => setVisual(v.id)}
              >
                {v.name}
                {v.needsPerson && <span className="cam-fx-tag">body</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
