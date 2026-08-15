import { useEffect, useRef, type JSX } from 'react'
import { PoseEngine } from './PoseEngine'
import { FaceEngine } from './FaceEngine'
import { PoseFeatures, type PoseFeatureState } from './PoseFeatures'
import {
  getVisual,
  drawSkeletonOverlay,
  drawFaceMeshOverlay,
  type VisualInput,
  type AudioReact
} from './VisualEngine'

export const ZERO_FEAT: PoseFeatureState = {
  present: 0,
  handsUp: 0,
  armSpread: 0,
  motion: 0,
  handPulse: 0,
  jump: 0,
  centerX: 0.5,
  centerY: 0.5
}

export const ZERO_AUDIO: AudioReact = { level: 0, kick: 0, fast: 0, surge: 0 }

/**
 * A self-contained camera surface: captures one device into a hidden <video>,
 * lazily runs pose/face detection when the active visual (or a debug overlay)
 * needs it, and renders the chosen visual to a <canvas> every frame. Shared by
 * the camera grid and the projector output window.
 */
export function CameraCanvas({
  deviceId,
  visualId,
  beatRef,
  audioRef,
  params,
  showSkeleton = false,
  showFaceMesh = false,
  className = 'cam-canvas',
  onFeatures,
  onStatus
}: {
  deviceId: string
  visualId: string
  beatRef: React.MutableRefObject<number>
  audioRef: React.MutableRefObject<AudioReact>
  /** Per-effect settings for the active visual (e.g. { intensity: 1 }). */
  params?: Record<string, number>
  showSkeleton?: boolean
  showFaceMesh?: boolean
  className?: string
  onFeatures?: (f: PoseFeatureState) => void
  onStatus?: (s: string) => void
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const visualIdRef = useRef(visualId)
  const skelRef = useRef(showSkeleton)
  const faceOverlayRef = useRef(showFaceMesh)
  const paramsRef = useRef<Record<string, number>>(params ?? {})
  visualIdRef.current = visualId
  skelRef.current = showSkeleton
  faceOverlayRef.current = showFaceMesh
  paramsRef.current = params ?? {}

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
      .getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      })
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

  // Render loop: draw the active visual; lazily load detection when needed.
  useEffect(() => {
    let raf = 0
    const features = new PoseFeatures(30)
    let pose: PoseEngine | null = null
    let face: FaceEngine | null = null
    let poseLoading = false
    let faceLoading = false
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

      const visual = getVisual(visualIdRef.current)
      const ready = video != null && video.readyState >= 2
      const needPose = visual.needsPose || skelRef.current
      const needFace = visual.needsFace || faceOverlayRef.current

      let poseFrame = null
      if (needPose) {
        if (!pose && !poseLoading) {
          poseLoading = true
          onStatus?.('Loading body model…')
          pose = new PoseEngine()
          pose
            .init()
            .then(() => onStatus?.(''))
            .catch((err) => onStatus?.(`Body detection failed: ${err?.message ?? err}`))
        }
        if (pose?.ready && ready) {
          poseFrame = pose.detect(video, performance.now())
          if (poseFrame) {
            lastFeat = features.addFrame(poseFrame)
            onFeatures?.(lastFeat)
          }
        }
      }

      let faceFrame = null
      if (needFace) {
        if (!face && !faceLoading) {
          faceLoading = true
          face = new FaceEngine()
          face.init().catch((err) => onStatus?.(`Face detection failed: ${err?.message ?? err}`))
        }
        if (face?.ready && ready) faceFrame = face.detect(video, performance.now())
      }

      const input: VisualInput = {
        video,
        pose: poseFrame,
        face: faceFrame,
        features: lastFeat,
        timeMs: performance.now(),
        beatPhase: beatRef.current,
        audio: audioRef.current,
        params: paramsRef.current,
        w,
        h
      }
      visual.render(ctx, input)
      if (skelRef.current) drawSkeletonOverlay(ctx, input)
      if (faceOverlayRef.current) drawFaceMeshOverlay(ctx, input)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      pose?.close()
      face?.close()
    }
  }, [beatRef, audioRef, onFeatures, onStatus])

  return (
    <>
      <video ref={videoRef} className="cam-video-hidden" muted playsInline />
      <canvas ref={canvasRef} className={className} />
    </>
  )
}
