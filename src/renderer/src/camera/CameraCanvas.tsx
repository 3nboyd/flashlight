import { useEffect, useRef, type JSX } from 'react'
import { PoseEngine } from './PoseEngine'
import { FaceEngine, type FaceFrame } from './FaceEngine'
import { PoseFeatures, type PoseFeatureState } from './PoseFeatures'
import {
  getVisual,
  renderOverlayLayer,
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
const BLACK = { r: 0, g: 0, b: 0 }

/**
 * A self-contained camera surface: captures one device into a hidden <video>,
 * lazily runs pose/face detection when the active visual (or a debug overlay)
 * needs it, and renders the chosen visual to a <canvas> every frame. Shared by
 * the camera grid and the projector output window.
 */
export function CameraCanvas({
  deviceId,
  visualId,
  overlayId = '',
  overlayParams,
  beatRef,
  audioRef,
  lightRef,
  params,
  fit = 'fill',
  showSkeleton = false,
  showFaceMesh = false,
  detectFraming = false,
  framingNeedsFace = false,
  recordCanvas = null,
  recordAspect = null,
  className = 'cam-canvas',
  onFeatures,
  onFraming,
  onStatus,
  onCanvasReady
}: {
  deviceId: string
  visualId: string
  /** Optional second effect layered over the base (the "combine" feature). */
  overlayId?: string
  /** Per-effect settings for the overlay visual. */
  overlayParams?: Record<string, number>
  /** When this tile is the program, the shared canvas to render the recorded
   *  final cut into at full camera resolution (independent of the preview size). */
  recordCanvas?: HTMLCanvasElement | null
  /** Aspect ratio to shape the record canvas to (null = the source's own). */
  recordAspect?: number | null
  beatRef: React.MutableRefObject<number>
  audioRef: React.MutableRefObject<AudioReact>
  /** Live dominant lighting color (0-255) for effects that match the rig. */
  lightRef?: React.MutableRefObject<{ r: number; g: number; b: number }>
  /** Per-effect settings for the active visual (e.g. { intensity: 1 }). */
  params?: Record<string, number>
  /** How the frame maps into the tile: 'fill' (crop) or 'fit' (letterbox). */
  fit?: 'fit' | 'fill'
  showSkeleton?: boolean
  showFaceMesh?: boolean
  /** Run body (and optionally face) detection to feed the auto-director, even
   *  when the effect itself doesn't need it. */
  detectFraming?: boolean
  framingNeedsFace?: boolean
  className?: string
  onFeatures?: (f: PoseFeatureState) => void
  /** Throttled framing report for the director (pose features + face frame +
   *  average frame luminance 0-1, used to spot a dead/black feed). */
  onFraming?: (feat: PoseFeatureState, face: FaceFrame | null, luma: number) => void
  onStatus?: (s: string) => void
  /** Reports the underlying canvas element (for recording); null on unmount. */
  onCanvasReady?: (el: HTMLCanvasElement | null) => void
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fitRef = useRef(fit)
  fitRef.current = fit
  const recordCanvasRef = useRef(recordCanvas)
  const recordAspectRef = useRef(recordAspect)
  recordCanvasRef.current = recordCanvas
  recordAspectRef.current = recordAspect
  const overlayIdRef = useRef(overlayId)
  const overlayParamsRef = useRef<Record<string, number>>(overlayParams ?? {})
  overlayIdRef.current = overlayId
  overlayParamsRef.current = overlayParams ?? {}
  const visualIdRef = useRef(visualId)
  const skelRef = useRef(showSkeleton)
  const faceOverlayRef = useRef(showFaceMesh)
  const paramsRef = useRef<Record<string, number>>(params ?? {})
  const framingRef = useRef(detectFraming)
  const framingFaceRef = useRef(framingNeedsFace)
  const onFramingRef = useRef(onFraming)
  visualIdRef.current = visualId
  skelRef.current = showSkeleton
  faceOverlayRef.current = showFaceMesh
  paramsRef.current = params ?? {}
  framingRef.current = detectFraming
  framingFaceRef.current = framingNeedsFace
  onFramingRef.current = onFraming

  // Hand the canvas element up (for recording), and clear it on unmount.
  useEffect(() => {
    onCanvasReady?.(canvasRef.current)
    return () => onCanvasReady?.(null)
  }, [onCanvasReady])

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
      // No fallback to a default camera: a missing/rotated deviceId must stay
      // black (and report unavailable), never open some other camera - that was
      // painting the same default feed into every stale tile.
      .catch((err) => onStatus?.(`Camera unavailable: ${err?.name ?? err}`))
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
    let lastFramingMs = 0
    // Tiny offscreen buffer to measure average brightness (dead/black feed).
    const lumaCanvas = document.createElement('canvas')
    lumaCanvas.width = 16
    lumaCanvas.height = 16
    const lumaCtx = lumaCanvas.getContext('2d', { willReadFrequently: true })
    const measureLuma = (v: HTMLVideoElement): number => {
      if (!lumaCtx) return 1
      lumaCtx.drawImage(v, 0, 0, 16, 16)
      const px = lumaCtx.getImageData(0, 0, 16, 16).data
      let sum = 0
      for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2]
      return sum / (px.length / 4) / (3 * 255)
    }

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
      // A combined overlay (Shift+click) layers a second effect on top; it may
      // need its own detection, so fold its requirements in below.
      const overlayId = overlayIdRef.current
      const overlay =
        overlayId && overlayId !== visualIdRef.current ? getVisual(overlayId) : null
      const ready = video != null && video.readyState >= 2
      const wantFraming = framingRef.current
      const effectPose = visual.needsPose || (overlay?.needsPose ?? false) || skelRef.current
      // The skeleton overlay also draws detailed face dots, so it needs face too.
      const effectFace =
        visual.needsFace || (overlay?.needsFace ?? false) || faceOverlayRef.current || skelRef.current
      const needPose = effectPose || wantFraming
      const needFace = effectFace || (wantFraming && framingFaceRef.current)
      // When detection is only for the director (the effect doesn't need it),
      // run it at the ~7fps framing cadence instead of every frame, so N
      // background cameras stay cheap.
      const now = performance.now()
      const framingTick = now - lastFramingMs > 140
      const runPose = effectPose || framingTick
      const runFace = effectFace || framingTick

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
        if (pose?.ready && ready && runPose) {
          poseFrame = pose.detect(video, now)
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
        if (face?.ready && ready && runFace) faceFrame = face.detect(video, now)
      }

      // Feed the auto-director at ~7fps (enough to switch on, cheap to run).
      // Include average brightness so it can spot a dead/black feed; a stream
      // that isn't ready reports 0 (treated as dark).
      if (wantFraming && framingTick) {
        lastFramingMs = now
        const luma = ready && video ? measureLuma(video) : 0
        onFramingRef.current?.(lastFeat, faceFrame, luma)
      }

      const input: VisualInput = {
        video,
        pose: poseFrame,
        face: faceFrame,
        features: lastFeat,
        timeMs: performance.now(),
        beatPhase: beatRef.current,
        audio: audioRef.current,
        light: lightRef?.current ?? BLACK,
        params: paramsRef.current,
        fit: fitRef.current,
        w,
        h
      }
      visual.render(ctx, input)
      if (overlay) renderOverlayLayer(ctx, input, overlay, overlayParamsRef.current)

      // When this tile is the program, render the same effect a second time at
      // full camera resolution into the shared record canvas, so the saved file
      // is full-res no matter how small the preview tile is. Reuses the pose/face
      // already detected this frame; skips the debug overlays.
      const rec = recordCanvasRef.current
      if (rec && ready && video) {
        const vw = video.videoWidth || w
        const vh = video.videoHeight || h
        const ar = recordAspectRef.current
        const rh = vh
        const rw = ar == null ? vw : Math.max(1, Math.round(vh * ar))
        if (rec.width !== rw || rec.height !== rh) {
          rec.width = rw
          rec.height = rh
        }
        const rctx = rec.getContext('2d')
        if (rctx) {
          const recInput: VisualInput = { ...input, w: rw, h: rh }
          visual.render(rctx, recInput)
          if (overlay) renderOverlayLayer(rctx, recInput, overlay, overlayParamsRef.current)
        }
      }

      if (skelRef.current) drawSkeletonOverlay(ctx, input)
      if (faceOverlayRef.current) drawFaceMeshOverlay(ctx, input)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      pose?.close()
      face?.close()
    }
  }, [beatRef, audioRef, lightRef, onFeatures, onStatus])
  /* framing/detect props are read through refs above, so they don't restart the
     camera loop when they change. */

  return (
    <>
      <video ref={videoRef} className="cam-video-hidden" muted playsInline />
      <canvas ref={canvasRef} className={className} />
    </>
  )
}
