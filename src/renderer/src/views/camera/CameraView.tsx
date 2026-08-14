import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { PoseEngine, POSE_BONES, type PoseFrame } from '../../camera/PoseEngine'
import { PoseFeatures, type PoseFeatureState } from '../../camera/PoseFeatures'
import './CameraView.css'

const STORE_KEY = 'djc.camera.enabled'

const ZERO_FEAT: PoseFeatureState = {
  present: 0,
  handsUp: 0,
  armSpread: 0,
  motion: 0,
  handPulse: 0,
  centerX: 0.5,
  centerY: 0.5
}

/** Draws the detected skeleton onto the overlay canvas (normalized -> pixels). */
function drawSkeleton(ctx: CanvasRenderingContext2D, frame: PoseFrame, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h)
  if (!frame.present) return
  const lm = frame.landmarks
  ctx.lineWidth = Math.max(2, w / 260)
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)'
  ctx.beginPath()
  for (const [a, b] of POSE_BONES) {
    if (lm[a].visibility < 0.35 || lm[b].visibility < 0.35) continue
    ctx.moveTo(lm[a].x * w, lm[a].y * h)
    ctx.lineTo(lm[b].x * w, lm[b].y * h)
  }
  ctx.stroke()
  ctx.fillStyle = 'rgba(244, 114, 182, 0.95)'
  const r = Math.max(3, w / 180)
  for (const p of lm) {
    if (p.visibility < 0.35) continue
    ctx.beginPath()
    ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** One live camera tile. When `detect`, runs pose detection + skeleton overlay. */
function CameraTile({
  deviceId,
  detect,
  onFeatures,
  onStatus
}: {
  deviceId: string
  detect: boolean
  onFeatures?: (f: PoseFeatureState) => void
  onStatus?: (s: string) => void
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: { exact: deviceId }, width: 1280, height: 720 }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          void videoRef.current.play()
        }
      })
      .catch(() => onStatus?.('Camera access denied or unavailable.'))
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [deviceId, onStatus])

  useEffect(() => {
    if (!detect) return
    let raf = 0
    let stopped = false
    const canvasEl = canvasRef.current
    const engine = new PoseEngine()
    const features = new PoseFeatures(30)
    onStatus?.('Loading detection model…')
    engine
      .init()
      .then(() => {
        if (stopped) return
        onStatus?.('')
        const loop = (): void => {
          raf = requestAnimationFrame(loop)
          const video = videoRef.current
          const canvas = canvasRef.current
          if (!video || !canvas || video.readyState < 2) return
          if (canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
          }
          const frame = engine.detect(video, performance.now())
          if (!frame) return
          const ctx = canvas.getContext('2d')
          if (ctx) drawSkeleton(ctx, frame, canvas.width, canvas.height)
          onFeatures?.(features.addFrame(frame))
        }
        loop()
      })
      .catch((err) => onStatus?.(`Detection failed to load: ${err?.message ?? err}`))
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      engine.close()
      if (canvasEl) canvasEl.getContext('2d')?.clearRect(0, 0, canvasEl.width, canvasEl.height)
    }
  }, [detect, onFeatures, onStatus])

  return (
    <div className="cam-tile">
      <video ref={videoRef} className="cam-video" muted playsInline />
      <canvas ref={canvasRef} className="cam-overlay" />
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
  const [detect, setDetect] = useState(false)
  const [feat, setFeat] = useState<PoseFeatureState>(ZERO_FEAT)
  const [status, setStatus] = useState('')
  const [needsPermission, setNeedsPermission] = useState(true)

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

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(enabled))
    if (primary && !enabled.includes(primary)) setPrimary(enabled[0] ?? null)
    if (!primary && enabled.length > 0) setPrimary(enabled[0])
  }, [enabled, primary])

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

  return (
    <div className="view camera-view">
      <div className="view-header">
        <h1>Camera</h1>
        <p className="view-sub">
          Live cameras and the body-detection engine. Preview the skeleton the engine sees; visual
          effects and recording build on this.
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
                      title="Detect on this camera"
                      onClick={() => setPrimary(d.deviceId)}
                    >
                      {primary === d.deviceId ? 'Detecting' : 'Detect'}
                    </button>
                  )}
                </label>
              ))}
            </div>
          )}

          <label className="cam-toggle">
            <input type="checkbox" checked={detect} onChange={(e) => setDetect(e.target.checked)} disabled={!primary} />
            Body detection {primary ? '' : '(enable a camera first)'}
          </label>
          {status && <p className="settings-hint">{status}</p>}

          {detect && (
            <div className="cam-features">
              <h3>Body features</h3>
              <Meter label="Present" value={feat.present} />
              <Meter label="Hands up" value={feat.handsUp} />
              <Meter label="Arm spread" value={feat.armSpread} />
              <Meter label="Motion" value={feat.motion} />
              <Meter label="Hand pulse" value={feat.handPulse} />
            </div>
          )}
        </aside>

        <div className="camera-stage">
          {enabled.length === 0 ? (
            <div className="camera-empty">Enable a camera to preview it here.</div>
          ) : (
            <div className={`cam-grid count-${Math.min(enabled.length, 4)}`}>
              {enabled.map((id) => (
                <CameraTile
                  key={id}
                  deviceId={id}
                  detect={detect && primary === id}
                  onFeatures={onFeatures}
                  onStatus={setStatus}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
