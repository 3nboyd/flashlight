import { POSE, type Landmark, type PoseFrame } from './PoseEngine'
import { FACE_CONTOURS, FACE_TESSELATION, type FaceFrame } from './FaceEngine'
import type { PoseFeatureState } from './PoseFeatures'

/**
 * The camera visual-FX engine: a library of "visual" modules that render one
 * frame to a canvas from the live camera + detected pose/face + music. Some turn
 * the DJ into a neon stickman or edge sketch; others work with just the camera
 * (person-free, music-reactive). Canvas2D; heavier looks can move to WebGL later
 * behind the same interface.
 */

/** Live music features (0-1) the visuals react to (from the lighting clock). */
export interface AudioReact {
  level: number // overall loudness
  kick: number // decaying punch on the kick drum
  fast: number // high-frequency energy (hats / texture)
  surge: number // build / riser marker
}

export interface VisualInput {
  video: HTMLVideoElement | null
  pose: PoseFrame | null
  face: FaceFrame | null
  features: PoseFeatureState
  timeMs: number
  /** 0-1 beat position from the lighting clock (tempo/music sync). */
  beatPhase: number
  /** Live music features for audio reactivity. */
  audio: AudioReact
  w: number
  h: number
}

export interface VisualModule {
  id: string
  name: string
  /** Runs body pose detection while active. */
  needsPose: boolean
  /** Runs detailed face detection while active. */
  needsFace: boolean
  render: (ctx: CanvasRenderingContext2D, input: VisualInput) => void
}

/** Rect the video is drawn into (object-fit: cover), for mapping landmarks. */
interface Rect {
  dx: number
  dy: number
  dw: number
  dh: number
}

function coverRect(vw: number, vh: number, w: number, h: number): Rect {
  if (!vw || !vh) return { dx: 0, dy: 0, dw: w, dh: h }
  const scale = Math.max(w / vw, h / vh)
  const dw = vw * scale
  const dh = vh * scale
  return { dx: (w - dw) / 2, dy: (h - dh) / 2, dw, dh }
}

function inputRect(input: VisualInput): Rect {
  return coverRect(
    input.video?.videoWidth ?? input.w,
    input.video?.videoHeight ?? input.h,
    input.w,
    input.h
  )
}

/** Draw the camera frame at object-fit: cover. Returns false if not ready. */
function drawVideoRaw(ctx: CanvasRenderingContext2D, input: VisualInput): boolean {
  const v = input.video
  if (!v || v.readyState < 2) return false
  const r = inputRect(input)
  ctx.drawImage(v, r.dx, r.dy, r.dw, r.dh)
  return true
}

function drawVideoCover(ctx: CanvasRenderingContext2D, input: VisualInput): Rect {
  const r = inputRect(input)
  if (!drawVideoRaw(ctx, input)) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, input.w, input.h)
  }
  return r
}

const mapX = (r: Rect, x: number): number => r.dx + x * r.dw
const mapY = (r: Rect, y: number): number => r.dy + y * r.dh

/** Beat-synced pulse 0..1 (sharp on the downbeat). */
function beatPulse(beatPhase: number): number {
  return Math.pow(1 - beatPhase, 2)
}

/** A single point in canvas space with a confidence, from a pose landmark. */
interface Pt {
  x: number
  y: number
  v: number
}
const lmPt = (r: Rect, lm: Landmark[], i: number): Pt => ({
  x: mapX(r, lm[i].x),
  y: mapY(r, lm[i].y),
  v: lm[i].visibility
})
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) })

// ---------------------------------------------------------------------------

const camera: VisualModule = {
  id: 'camera',
  name: 'Camera',
  needsPose: false,
  needsFace: false,
  render: (ctx, input) => {
    drawVideoCover(ctx, input)
  }
}

const mono: VisualModule = {
  id: 'mono',
  name: 'Black & White',
  needsPose: false,
  needsFace: false,
  render: (ctx, input) => {
    const contrast = 1.15 + 0.7 * input.audio.level + 0.5 * input.audio.kick
    const bright = 0.95 + 0.35 * input.audio.kick
    ctx.filter = `grayscale(1) contrast(${contrast.toFixed(3)}) brightness(${bright.toFixed(3)})`
    drawVideoCover(ctx, input)
    ctx.filter = 'none'
  }
}

// ---- Neon Stickman (center spine + joints + detailed face mesh) -----------

/** Thin red/green face-mesh drawing over detected face landmarks. */
function drawFaceMesh(
  ctx: CanvasRenderingContext2D,
  face: FaceFrame,
  r: Rect,
  scale: number,
  glow: number
): void {
  const lm = face.landmarks
  if (lm.length === 0) return
  const px = (i: number): number => mapX(r, lm[i].x)
  const py = (i: number): number => mapY(r, lm[i].y)

  // Deep tracking: faint green tesselation of the whole face.
  ctx.lineWidth = Math.max(0.4, scale * 0.5)
  ctx.strokeStyle = `rgba(60, 255, 140, ${0.16 + 0.12 * glow})`
  ctx.beginPath()
  for (const c of FACE_TESSELATION) {
    if (c.start >= lm.length || c.end >= lm.length) continue
    ctx.moveTo(px(c.start), py(c.start))
    ctx.lineTo(px(c.end), py(c.end))
  }
  ctx.stroke()

  // Contours in crisp red / green. [oval, lEye, rEye, lBrow, rBrow, lips, lIris, rIris]
  const colors = [
    'rgba(255,60,80,0.95)', // face oval - red
    'rgba(80,255,140,0.95)', // left eye - green
    'rgba(80,255,140,0.95)', // right eye - green
    'rgba(255,80,80,0.95)', // left eyebrow - red
    'rgba(255,80,80,0.95)', // right eyebrow - red
    'rgba(255,70,90,0.95)', // lips - red
    'rgba(120,255,180,1)', // left iris - bright green
    'rgba(120,255,180,1)' // right iris - bright green
  ]
  for (let ci = 0; ci < FACE_CONTOURS.length; ci++) {
    const conn = FACE_CONTOURS[ci]
    ctx.strokeStyle = colors[ci] ?? 'rgba(80,255,140,0.9)'
    ctx.lineWidth = Math.max(0.8, scale * (ci >= 6 ? 1.4 : 1.0))
    ctx.beginPath()
    for (const c of conn) {
      if (c.start >= lm.length || c.end >= lm.length) continue
      ctx.moveTo(px(c.start), py(c.start))
      ctx.lineTo(px(c.end), py(c.end))
    }
    ctx.stroke()
  }
}

const stickman: VisualModule = {
  id: 'stickman',
  name: 'Neon Stickman',
  needsPose: true,
  needsFace: true,
  render: (ctx, input) => {
    ctx.fillStyle = '#05060a'
    ctx.fillRect(0, 0, input.w, input.h)
    if (!input.pose?.present) return
    const r = inputRect(input)
    const lm = input.pose.landmarks

    const P = (i: number): Pt => lmPt(r, lm, i)
    const nose = P(POSE.nose)
    const lSh = P(POSE.leftShoulder)
    const rSh = P(POSE.rightShoulder)
    const lEl = P(POSE.leftElbow)
    const rEl = P(POSE.rightElbow)
    const lWr = P(POSE.leftWrist)
    const rWr = P(POSE.rightWrist)
    const lHip = P(POSE.leftHip)
    const rHip = P(POSE.rightHip)
    const lKn = P(POSE.leftKnee)
    const rKn = P(POSE.rightKnee)
    const lAn = P(POSE.leftAnkle)
    const rAn = P(POSE.rightAnkle)

    const neck = mid(lSh, rSh) // top of the center spine
    const pelvis = mid(lHip, rHip) // bottom of the center spine

    // Reactivity: beat + kick drive glow and stroke width; jump flashes white.
    const glow = 0.45 + 0.55 * Math.max(beatPulse(input.beatPhase), input.audio.kick)
    const jump = input.features.jump
    const hue = (input.timeMs / 35) % 360
    const unit = Math.max(3, input.w / 150)
    ctx.lineWidth = unit * (0.85 + 0.7 * glow)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const stroke = jump > 0.15 ? `hsl(${hue}, 100%, ${75 + 20 * jump}%)` : `hsl(${hue}, 92%, ${48 + 28 * glow}%)`
    ctx.strokeStyle = stroke
    ctx.shadowColor = stroke
    ctx.shadowBlur = (16 + 22 * jump) * glow

    const V = 0.35 // visibility gate
    const seg = (a: Pt, b: Pt): void => {
      if (a.v < V || b.v < V) return
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }

    // Center spine (no torso box): neck -> pelvis, plus short shoulder/hip bars.
    seg(neck, pelvis)
    seg(lSh, rSh)
    seg(lHip, rHip)
    // Arms.
    seg(lSh, lEl)
    seg(lEl, lWr)
    seg(rSh, rEl)
    seg(rEl, rWr)
    // Legs.
    seg(lHip, lKn)
    seg(lKn, lAn)
    seg(rHip, rKn)
    seg(rKn, rAn)
    // Neck stub up toward the head.
    seg(neck, nose)

    // Joints as filled circles.
    ctx.shadowBlur = 10 * glow
    const joint = (p: Pt, s: number): void => {
      if (p.v < V) return
      ctx.fillStyle = stroke
      ctx.beginPath()
      ctx.arc(p.x, p.y, unit * s * (0.9 + 0.4 * glow), 0, Math.PI * 2)
      ctx.fill()
    }
    for (const p of [neck, pelvis, lEl, rEl, lWr, rWr, lKn, rKn, lAn, rAn]) joint(p, 0.55)

    ctx.shadowBlur = 0

    // Head: detailed red/green face mesh if we have it, else a neon ring.
    if (input.face?.present) {
      drawFaceMesh(ctx, input.face, r, Math.max(1, input.w / 640) * (0.9 + 0.5 * glow), glow)
    } else {
      const headR = Math.hypot(lSh.x - rSh.x, lSh.y - rSh.y) * 0.42 || unit * 3
      ctx.strokeStyle = stroke
      ctx.lineWidth = unit * 0.6
      ctx.beginPath()
      ctx.arc(nose.x, nose.y - headR * 0.2, headR, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}

// ---- Face Mesh (detailed face only) ---------------------------------------

const faceMesh: VisualModule = {
  id: 'face',
  name: 'Face Mesh',
  needsPose: false,
  needsFace: true,
  render: (ctx, input) => {
    // Dim the camera under the mesh so the lines pop.
    ctx.fillStyle = '#04050a'
    ctx.fillRect(0, 0, input.w, input.h)
    if (drawVideoRaw(ctx, input)) {
      ctx.fillStyle = 'rgba(4,5,10,0.62)'
      ctx.fillRect(0, 0, input.w, input.h)
    }
    if (!input.face?.present) return
    const r = inputRect(input)
    const glow = 0.5 + 0.5 * Math.max(beatPulse(input.beatPhase), input.audio.kick)
    ctx.shadowColor = 'rgba(80,255,150,0.7)'
    ctx.shadowBlur = 10 * glow
    drawFaceMesh(ctx, input.face, r, Math.max(1, input.w / 520) * (0.9 + 0.5 * glow), glow)
    ctx.shadowBlur = 0
  }
}

// ---- Sketch (edge-detected outlines / "ink" on the body) ------------------

let edgeSrc: HTMLCanvasElement | null = null
let edgeOut: HTMLCanvasElement | null = null

const sketch: VisualModule = {
  id: 'sketch',
  name: 'Sketch',
  needsPose: false,
  needsFace: true,
  render: (ctx, input) => {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, input.w, input.h)
    const v = input.video
    if (!v || v.readyState < 2) return

    // Downscale the frame for a cheap Sobel edge pass.
    const sw = 320
    const sh = Math.max(1, Math.round((sw * v.videoHeight) / Math.max(1, v.videoWidth)))
    if (!edgeSrc) edgeSrc = document.createElement('canvas')
    if (!edgeOut) edgeOut = document.createElement('canvas')
    if (edgeSrc.width !== sw || edgeSrc.height !== sh) {
      edgeSrc.width = sw
      edgeSrc.height = sh
      edgeOut.width = sw
      edgeOut.height = sh
    }
    const sctx = edgeSrc.getContext('2d', { willReadFrequently: true })
    const octx = edgeOut.getContext('2d')
    if (!sctx || !octx) return
    sctx.drawImage(v, 0, 0, sw, sh)
    const src = sctx.getImageData(0, 0, sw, sh)
    const s = src.data
    // Grayscale luminance buffer.
    const g = new Float32Array(sw * sh)
    for (let i = 0, p = 0; i < g.length; i++, p += 4) {
      g[i] = 0.299 * s[p] + 0.587 * s[p + 1] + 0.114 * s[p + 2]
    }
    const out = octx.createImageData(sw, sh)
    const o = out.data
    const gain = 1.1 + 1.6 * input.audio.level + 1.2 * input.audio.kick
    const hue = (input.timeMs / 45) % 360
    // Colored ink tint that drifts with the music.
    const tintR = 180 + 75 * Math.sin((hue * Math.PI) / 180)
    const tintG = 180 + 75 * Math.sin((hue * Math.PI) / 180 + 2.1)
    const tintB = 180 + 75 * Math.sin((hue * Math.PI) / 180 + 4.2)
    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        const i = y * sw + x
        const gx =
          -g[i - sw - 1] - 2 * g[i - 1] - g[i + sw - 1] + g[i - sw + 1] + 2 * g[i + 1] + g[i + sw + 1]
        const gy =
          -g[i - sw - 1] - 2 * g[i - sw] - g[i - sw + 1] + g[i + sw - 1] + 2 * g[i + sw] + g[i + sw + 1]
        let m = (Math.sqrt(gx * gx + gy * gy) / 255) * gain
        if (m > 1) m = 1
        m = m < 0.14 ? 0 : m // threshold to clean "ink" strokes
        const p = i * 4
        o[p] = tintR * m
        o[p + 1] = tintG * m
        o[p + 2] = tintB * m
        o[p + 3] = 255 * m
      }
    }
    octx.putImageData(out, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.globalCompositeOperation = 'lighter'
    const r = inputRect(input)
    ctx.drawImage(edgeOut, r.dx, r.dy, r.dw, r.dh)
    ctx.globalCompositeOperation = 'source-over'

    // Extra intricate detail: overlay the red/green face contours as "writing".
    if (input.face?.present) {
      ctx.shadowColor = 'rgba(80,255,150,0.6)'
      ctx.shadowBlur = 6
      drawFaceMesh(ctx, input.face, r, Math.max(0.8, input.w / 700), 0.6)
      ctx.shadowBlur = 0
    }
  }
}

// ---- Echo Trails (video feedback, person-free, music-reactive) ------------

const echo: VisualModule = {
  id: 'echo',
  name: 'Echo Trails',
  needsPose: false,
  needsFace: false,
  render: (ctx, input) => {
    const { w, h } = input
    const level = input.audio.level
    const kick = input.audio.kick
    const energy = Math.max(level, input.features.motion, beatPulse(input.beatPhase))

    // 1) Decay the existing frame toward black (trail length grows when louder).
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = `rgba(0,0,0,${(0.16 - 0.09 * level).toFixed(3)})`
    ctx.fillRect(0, 0, w, h)

    // 2) Feed the canvas back onto itself, zoomed + slowly rotating -> trails.
    ctx.save()
    ctx.globalAlpha = 0.9
    const zoom = 1.035 + 0.05 * kick
    const rot = 0.003 * Math.sin(input.timeMs / 1400) + 0.02 * kick
    ctx.translate(w / 2, h / 2)
    ctx.rotate(rot)
    ctx.scale(zoom, zoom)
    ctx.translate(-w / 2, -h / 2)
    ctx.drawImage(ctx.canvas, 0, 0, w, h)
    ctx.restore()
    ctx.globalAlpha = 1

    // 3) Inject the live camera, hue-shifted + additive, so motion paints light.
    if (input.video && input.video.readyState >= 2) {
      const hue = (input.timeMs / 22) % 360
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.4 + 0.45 * energy
      ctx.filter = `hue-rotate(${hue.toFixed(0)}deg) saturate(1.7) brightness(${(0.7 + 0.7 * kick).toFixed(2)}) contrast(1.2)`
      drawVideoRaw(ctx, input)
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    // 4) Jump -> a quick white bloom across the whole frame.
    if (input.features.jump > 0.1) {
      ctx.fillStyle = `rgba(255,255,255,${(0.35 * input.features.jump).toFixed(3)})`
      ctx.fillRect(0, 0, w, h)
    }
  }
}

export const VISUALS: VisualModule[] = [camera, mono, stickman, faceMesh, sketch, echo]

export function getVisual(id: string): VisualModule {
  return VISUALS.find((v) => v.id === id) ?? camera
}
