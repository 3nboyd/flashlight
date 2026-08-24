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
  captureHeight = 720,
  cameraDelayMs = 0,
  showSkeleton = false,
  showFaceMesh = false,
  detectFraming = false,
  framingNeedsFace = false,
  recordCanvas = null,
  recordAspect = null,
  recordClean = false,
  recordMaxHeight = 720,
  className = 'cam-canvas',
  onFeatures,
  onFraming,
  onStatus,
  onFps,
  onResolution,
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
  /** Record the plain camera feed even while the tile shows an effect (so the
   *  file stays clean while the projector/TV keeps the effect). */
  recordClean?: boolean
  /** Max height of the record canvas (0 = the camera's full resolution). */
  recordMaxHeight?: number
  /** Reports the tile's render frame rate (~once per second) for the monitors. */
  onFps?: (fps: number) => void
  /** Reports the camera's actual capture resolution + fps once the stream opens. */
  onResolution?: (info: { w: number; h: number; fps: number }) => void
  beatRef: React.MutableRefObject<number>
  audioRef: React.MutableRefObject<AudioReact>
  /** Live dominant lighting color (0-255) for effects that match the rig. */
  lightRef?: React.MutableRefObject<{ r: number; g: number; b: number }>
  /** Per-effect settings for the active visual (e.g. { intensity: 1 }). */
  params?: Record<string, number>
  /** How the frame maps into the tile: 'fill' (crop) or 'fit' (letterbox). */
  fit?: 'fit' | 'fill'
  /** Preferred capture height to request from the camera (e.g. 720 or 1080). */
  captureHeight?: number
  /** Delay this camera's frames by N ms (A/V sync for laggy wireless feeds). */
  cameraDelayMs?: number
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
  const recordCleanRef = useRef(recordClean)
  const recordMaxHeightRef = useRef(recordMaxHeight)
  const onFpsRef = useRef(onFps)
  const onResolutionRef = useRef(onResolution)
  const cameraDelayRef = useRef(cameraDelayMs)
  cameraDelayRef.current = cameraDelayMs
  recordCanvasRef.current = recordCanvas
  recordAspectRef.current = recordAspect
  recordCleanRef.current = recordClean
  recordMaxHeightRef.current = recordMaxHeight
  onFpsRef.current = onFps
  onResolutionRef.current = onResolution
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
        // Report the actual capture resolution + fps for the per-camera readout.
        const report = (): void => {
          const st = s.getVideoTracks()[0]?.getSettings()
          const w = videoRef.current?.videoWidth || st?.width || 0
          const h = videoRef.current?.videoHeight || st?.height || 0
          if (w && h) onResolutionRef.current?.({ w, h, fps: Math.round(st?.frameRate ?? 0) })
        }
        videoRef.current.addEventListener('loadedmetadata', report, { once: true })
      }
    }
    navigator.mediaDevices
      .getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: captureHeight >= 1080 ? 1920 : 1280 },
          height: { ideal: captureHeight }
        },
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
  }, [deviceId, onStatus, captureHeight])

  // Render loop: draw the active visual; lazily load detection when needed.
  // Driven by a self-scheduling timer (not requestAnimationFrame): macOS pauses
  // rAF for a window that's occluded behind another app - which made recordings
  // laggy for the whole set while the DJ software was in front. A timer keeps
  // firing in the background (webPreferences.backgroundThrottling is off), so the
  // record canvas - and the captured video - stay smooth no matter what's on top.
  useEffect(() => {
    const FRAME_MS = 1000 / 60
    let timer = 0
    let stopped = false
    const features = new PoseFeatures(30)
    let pose: PoseEngine | null = null
    let face: FaceEngine | null = null
    let poseLoading = false
    let faceLoading = false
    let lastFeat = ZERO_FEAT
    let lastFramingMs = 0
    // Render frame-rate counter, reported ~once per second for the monitors.
    let fpsCount = 0
    let fpsSince = performance.now()
    // Frame-delay ring buffer for A/V sync (only allocated while a delay is set).
    // Ceiling covers a per-camera delay (<=400) plus a "push forward" from another
    // camera (<=300).
    const DELAY_MAX_MS = 700
    const DELAY_RING_H = 720
    const delayPool: HTMLCanvasElement[] = []
    let delayRing: { c: HTMLCanvasElement; t: number }[] = []
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

    const tick = (): void => {
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

      // A/V-sync delay: buffer recent frames and paint the one from N ms ago.
      const delay = Math.max(0, Math.min(DELAY_MAX_MS, cameraDelayRef.current))
      let frame: CanvasImageSource | null = null
      let frameW = 0
      let frameH = 0
      if (delay > 0 && ready && video) {
        const vw = video.videoWidth || w
        const vh = video.videoHeight || h
        const rh = Math.min(vh, DELAY_RING_H)
        const rw = Math.max(1, Math.round((vw * rh) / vh))
        const c = delayPool.pop() ?? document.createElement('canvas')
        if (c.width !== rw || c.height !== rh) {
          c.width = rw
          c.height = rh
        }
        c.getContext('2d')?.drawImage(video, 0, 0, rw, rh)
        delayRing.push({ c, t: now })
        // Drop (and recycle) frames older than we could ever need.
        while (delayRing.length > 1 && delayRing[0].t < now - delay - 250) {
          delayPool.push(delayRing.shift()!.c)
        }
        // Newest frame at or before (now - delay); fall back to the oldest.
        let pick = delayRing[0]
        for (let i = delayRing.length - 1; i >= 0; i--) {
          if (delayRing[i].t <= now - delay) {
            pick = delayRing[i]
            break
          }
        }
        frame = pick.c
        frameW = rw
        frameH = rh
      } else if (delayRing.length) {
        delayRing = [] // delay turned off - free the buffer
      }

      const input: VisualInput = {
        video,
        frame,
        frameW,
        frameH,
        frameReady: frame != null,
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
      // The visible preview is pointless when the window is hidden (minimized or
      // behind a full-screen app); skip it to save CPU, but keep the record
      // canvas below updating so the recording stays live and smooth.
      const drawVisible = !document.hidden
      if (drawVisible) {
        visual.render(ctx, input)
        if (overlay) renderOverlayLayer(ctx, input, overlay, overlayParamsRef.current)
      }

      // When this tile is the program, render the same effect a second time into
      // the shared record canvas. Its height is capped by recordMaxHeight (0 =
      // the camera's full resolution): higher = sharper but ~quadratically more
      // render + encode cost, so 720p keeps long recordings smooth while 1080p /
      // source is available when the CPU/hardware encoder can take it. Reuses this
      // frame's pose/face; skips the debug overlays.
      const rec = recordCanvasRef.current
      if (rec && ready && video) {
        const vw = video.videoWidth || w
        const vh = video.videoHeight || h
        const ar = recordAspectRef.current
        const cap = recordMaxHeightRef.current
        const rh = cap > 0 ? Math.min(vh, cap) : vh
        const rw = ar == null ? Math.round(vw * (rh / vh)) : Math.max(1, Math.round(rh * ar))
        if (rec.width !== rw || rec.height !== rh) {
          rec.width = rw
          rec.height = rh
        }
        const rctx = rec.getContext('2d')
        if (rctx) {
          const recInput: VisualInput = { ...input, w: rw, h: rh }
          // "Effects only for projector" records the clean camera; otherwise the
          // recording matches the tile's effect (+ combined overlay).
          if (recordCleanRef.current) {
            getVisual('camera').render(rctx, recInput)
          } else {
            visual.render(rctx, recInput)
            if (overlay) renderOverlayLayer(rctx, recInput, overlay, overlayParamsRef.current)
          }
        }
      }

      if (drawVisible && skelRef.current) drawSkeletonOverlay(ctx, input)
      if (drawVisible && faceOverlayRef.current) drawFaceMeshOverlay(ctx, input)

      // Report the render frame rate roughly once a second.
      fpsCount++
      const dt = now - fpsSince
      if (dt >= 1000) {
        onFpsRef.current?.(Math.round((fpsCount * 1000) / dt))
        fpsCount = 0
        fpsSince = now
      }
    }
    // Schedule so the period stays ~FRAME_MS regardless of how long a tick takes,
    // and so it never piles up under load.
    const schedule = (): void => {
      if (stopped) return
      const t0 = performance.now()
      tick()
      timer = window.setTimeout(schedule, Math.max(0, FRAME_MS - (performance.now() - t0)))
    }
    schedule()
    return () => {
      stopped = true
      clearTimeout(timer)
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
