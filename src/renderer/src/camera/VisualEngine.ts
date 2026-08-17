import { POSE, POSE_BONES, type Landmark, type PoseFrame } from './PoseEngine'
import { FACE_CONTOURS, FACE_TESSELATION, type FaceFrame } from './FaceEngine'
import type { PoseFeatureState } from './PoseFeatures'

/**
 * The camera visual-FX engine: a library of "visual" modules that render one
 * frame to a canvas from the live camera + detected pose/face + music. Some turn
 * the DJ into a neon stickman or spinning head; most are person-free VJ
 * backgrounds (kaleidoscope, starfield, grid, plasma, particles) that react to
 * the adaptive music features. Canvas2D; heavier looks can move to WebGL later.
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
  /** Dominant lit color of the rig right now (0-255); {0,0,0} when dark. */
  light: { r: number; g: number; b: number }
  /** Per-effect user settings (e.g. intensity), keyed by param id. */
  params: Record<string, number>
  /** How the camera frame maps into the tile: 'fill' crops to fill, 'fit'
   *  letterboxes the whole frame. Applies to the plain feed, effects, and the
   *  detection overlays alike, so they all line up. */
  fit: 'fit' | 'fill'
  w: number
  h: number
}

/** A user-tunable setting an effect exposes (rendered as a slider). */
export interface VisualParam {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
}

export interface VisualModule {
  id: string
  name: string
  /** Reads the live camera feed (groups it under "Camera" in the UI). */
  usesCamera: boolean
  /** Runs body pose detection while active. */
  needsPose: boolean
  /** Runs detailed face detection while active. */
  needsFace: boolean
  /** User-adjustable settings shown in the effect's own panel. */
  params?: VisualParam[]
  render: (ctx: CanvasRenderingContext2D, input: VisualInput) => void
}

/** Read an effect param with a fallback (when settings aren't loaded yet). */
function pget(input: VisualInput, key: string, dflt: number): number {
  const v = input.params[key]
  return v == null || Number.isNaN(v) ? dflt : v
}

/** Default param values for a module (used to seed settings + render). */
export function defaultParams(m: VisualModule): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of m.params ?? []) out[p.key] = p.default
  return out
}

// ---- shared helpers -------------------------------------------------------

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

function containRect(vw: number, vh: number, w: number, h: number): Rect {
  if (!vw || !vh) return { dx: 0, dy: 0, dw: w, dh: h }
  const scale = Math.min(w / vw, h / vh)
  const dw = vw * scale
  const dh = vh * scale
  return { dx: (w - dw) / 2, dy: (h - dh) / 2, dw, dh }
}

/**
 * Where the frame is drawn inside the tile - honoring the fit setting. Every
 * effect and overlay maps through this, so the plain feed, effects, and the
 * skeleton/face overlays all use the same box (no more "effect is zoomed in").
 */
function inputRect(input: VisualInput): Rect {
  const vw = input.video?.videoWidth ?? input.w
  const vh = input.video?.videoHeight ?? input.h
  return input.fit === 'fit'
    ? containRect(vw, vh, input.w, input.h)
    : coverRect(vw, vh, input.w, input.h)
}

function drawVideoRaw(ctx: CanvasRenderingContext2D, input: VisualInput): boolean {
  const v = input.video
  if (!v || v.readyState < 2) return false
  const r = inputRect(input)
  ctx.drawImage(v, r.dx, r.dy, r.dw, r.dh)
  return true
}

/** Draw the frame honoring the fit setting; letterbox bars are painted black. */
function drawVideoCover(ctx: CanvasRenderingContext2D, input: VisualInput): Rect {
  const r = inputRect(input)
  // Fill mode covers the tile, so a clear is only needed to paint the bars in
  // fit mode (or when there's no frame yet).
  if (input.fit === 'fit' || !input.video || input.video.readyState < 2) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, input.w, input.h)
  }
  drawVideoRaw(ctx, input)
  return r
}

const mapX = (r: Rect, x: number): number => r.dx + x * r.dw
const mapY = (r: Rect, y: number): number => r.dy + y * r.dh

/** Beat-synced pulse 0..1 (sharp on the downbeat). */
function beatPulse(beatPhase: number): number {
  return Math.pow(1 - beatPhase, 2)
}

/** Reusable offscreen canvases keyed by name (for per-pixel / mirror passes). */
const scratch: Record<string, HTMLCanvasElement> = {}
function getScratch(key: string, w: number, h: number): HTMLCanvasElement {
  let c = scratch[key]
  if (!c) {
    c = document.createElement('canvas')
    scratch[key] = c
  }
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  return c
}

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
// Camera-derived looks
// ---------------------------------------------------------------------------

const camera: VisualModule = {
  id: 'camera',
  name: 'Camera',
  usesCamera: true,
  needsPose: false,
  needsFace: false,
  // The tile carries the chosen aspect ratio; fit/fill decides letterbox vs crop.
  render: (ctx, input) => {
    drawVideoCover(ctx, input)
  }
}

const mono: VisualModule = {
  id: 'mono',
  name: 'Black & White',
  usesCamera: true,
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

// ---- Neon Stickman (circle head + line body + hands) ----------------------

/** Draw a simple hand fan from the wrist toward thumb / index / pinky tips. */
function drawHand(
  ctx: CanvasRenderingContext2D,
  wrist: Pt,
  thumb: Pt,
  index: Pt,
  pinky: Pt,
  unit: number,
  gate: number
): void {
  if (wrist.v < gate) return
  ctx.beginPath()
  for (const tip of [thumb, index, pinky]) {
    if (tip.v < gate) continue
    ctx.moveTo(wrist.x, wrist.y)
    ctx.lineTo(tip.x, tip.y)
  }
  // Knuckle arc across the finger tips reads as a palm.
  if (index.v >= gate && pinky.v >= gate) {
    ctx.moveTo(index.x, index.y)
    ctx.lineTo(pinky.x, pinky.y)
  }
  ctx.stroke()
  // Little dots at the finger tips.
  for (const tip of [thumb, index, pinky]) {
    if (tip.v < gate) continue
    ctx.beginPath()
    ctx.arc(tip.x, tip.y, unit * 0.28, 0, Math.PI * 2)
    ctx.fill()
  }
}

const stickman: VisualModule = {
  id: 'stickman',
  name: 'Neon Stickman',
  usesCamera: true,
  needsPose: true,
  needsFace: false,
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
    const neck = mid(lSh, rSh)
    const pelvis = mid(lHip, rHip)

    const glow = 0.45 + 0.55 * Math.max(beatPulse(input.beatPhase), input.audio.kick)
    const jump = input.features.jump
    const hue = (input.timeMs / 35) % 360
    const unit = Math.max(3, input.w / 150)
    ctx.lineWidth = unit * (0.85 + 0.7 * glow)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const stroke =
      jump > 0.15 ? `hsl(${hue}, 100%, ${75 + 20 * jump}%)` : `hsl(${hue}, 92%, ${48 + 28 * glow}%)`
    ctx.strokeStyle = stroke
    ctx.fillStyle = stroke
    ctx.shadowColor = stroke
    ctx.shadowBlur = (16 + 22 * jump) * glow

    const V = 0.35
    const seg = (a: Pt, b: Pt): void => {
      if (a.v < V || b.v < V) return
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }

    // Center spine + crossbars (no torso box).
    seg(neck, pelvis)
    seg(lSh, rSh)
    seg(lHip, rHip)
    // Arms + legs.
    seg(lSh, lEl)
    seg(lEl, lWr)
    seg(rSh, rEl)
    seg(rEl, rWr)
    seg(lHip, lKn)
    seg(lKn, lAn)
    seg(rHip, rKn)
    seg(rKn, rAn)

    // Hands.
    ctx.lineWidth = unit * 0.6 * (0.85 + 0.5 * glow)
    drawHand(ctx, lWr, P(POSE.leftThumb), P(POSE.leftIndex), P(POSE.leftPinky), unit, V)
    drawHand(ctx, rWr, P(POSE.rightThumb), P(POSE.rightIndex), P(POSE.rightPinky), unit, V)

    // Joints.
    ctx.shadowBlur = 10 * glow
    for (const p of [neck, pelvis, lEl, rEl, lWr, rWr, lKn, rKn, lAn, rAn]) {
      if (p.v < V) continue
      ctx.beginPath()
      ctx.arc(p.x, p.y, unit * 0.55 * (0.9 + 0.4 * glow), 0, Math.PI * 2)
      ctx.fill()
    }

    // Circle head (no face mesh) sized from shoulder width.
    const headR = Math.hypot(lSh.x - rSh.x, lSh.y - rSh.y) * 0.42 || unit * 3
    ctx.lineWidth = unit * 0.7
    ctx.beginPath()
    ctx.arc(nose.x, nose.y - headR * 0.15, headR, 0, Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0
  }
}

// ---- Sketch (edge-detected "ink" outlines) --------------------------------

const sketch: VisualModule = {
  id: 'sketch',
  name: 'Sketch',
  usesCamera: true,
  needsPose: false,
  needsFace: false,
  render: (ctx, input) => {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, input.w, input.h)
    const v = input.video
    if (!v || v.readyState < 2) return

    const sw = 320
    const sh = Math.max(1, Math.round((sw * v.videoHeight) / Math.max(1, v.videoWidth)))
    const srcC = getScratch('edgeSrc', sw, sh)
    const outC = getScratch('edgeOut', sw, sh)
    const sctx = srcC.getContext('2d', { willReadFrequently: true })
    const octx = outC.getContext('2d')
    if (!sctx || !octx) return
    sctx.drawImage(v, 0, 0, sw, sh)
    const s = sctx.getImageData(0, 0, sw, sh).data
    const g = new Float32Array(sw * sh)
    for (let i = 0, p = 0; i < g.length; i++, p += 4) {
      g[i] = 0.299 * s[p] + 0.587 * s[p + 1] + 0.114 * s[p + 2]
    }
    const out = octx.createImageData(sw, sh)
    const o = out.data
    const gain = 1.1 + 1.6 * input.audio.level + 1.2 * input.audio.kick
    // Ink color tracks the live lighting; when the rig is dark, fall back to a
    // clean white/gray so the sketch is always legible.
    const lc = input.light
    const lit = lc.r + lc.g + lc.b > 40
    let tintR = 210
    let tintG = 214
    let tintB = 220
    if (lit) {
      // Normalize toward full brightness so dim rig colors still read as ink.
      const max = Math.max(lc.r, lc.g, lc.b, 1)
      const scale = 235 / max
      tintR = Math.min(255, 30 + lc.r * scale)
      tintG = Math.min(255, 30 + lc.g * scale)
      tintB = Math.min(255, 30 + lc.b * scale)
    }
    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        const i = y * sw + x
        const gx =
          -g[i - sw - 1] - 2 * g[i - 1] - g[i + sw - 1] + g[i - sw + 1] + 2 * g[i + 1] + g[i + sw + 1]
        const gy =
          -g[i - sw - 1] - 2 * g[i - sw] - g[i - sw + 1] + g[i + sw - 1] + 2 * g[i + sw] + g[i + sw + 1]
        let m = (Math.sqrt(gx * gx + gy * gy) / 255) * gain
        if (m > 1) m = 1
        m = m < 0.14 ? 0 : m
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
    ctx.drawImage(outC, r.dx, r.dy, r.dw, r.dh)
    ctx.globalCompositeOperation = 'source-over'
  }
}

// ---- Echo Trails (video feedback) -----------------------------------------

const echo: VisualModule = {
  id: 'echo',
  name: 'Echo Trails',
  usesCamera: true,
  needsPose: false,
  needsFace: false,
  render: (ctx, input) => {
    const { w, h } = input
    const level = input.audio.level
    const kick = input.audio.kick
    const energy = Math.max(level, input.features.motion, beatPulse(input.beatPhase))

    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = `rgba(0,0,0,${(0.16 - 0.09 * level).toFixed(3)})`
    ctx.fillRect(0, 0, w, h)

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

    if (input.features.jump > 0.1) {
      ctx.fillStyle = `rgba(255,255,255,${(0.35 * input.features.jump).toFixed(3)})`
      ctx.fillRect(0, 0, w, h)
    }
  }
}

// ---- Starfield / Warp -----------------------------------------------------

interface Star {
  x: number
  y: number
  z: number
}
let stars: Star[] = []
function resetStar(s: Star): void {
  s.x = (Math.random() * 2 - 1) * 1.3
  s.y = (Math.random() * 2 - 1) * 1.3
  s.z = 1
}

const starfield: VisualModule = {
  id: 'starfield',
  name: 'Starfield',
  usesCamera: false,
  needsPose: false,
  needsFace: false,
  params: [{ key: 'intensity', label: 'Intensity', min: 0.3, max: 2, step: 0.05, default: 1 }],
  render: (ctx, input) => {
    const { w, h } = input
    const intensity = pget(input, 'intensity', 1)
    if (stars.length !== 260) {
      stars = Array.from({ length: 260 }, () => {
        const s = { x: 0, y: 0, z: 0 }
        resetStar(s)
        s.z = Math.random()
        return s
      })
    }
    // Trails: fade toward black (longer streaks when louder).
    ctx.fillStyle = `rgba(2,3,12,${(0.35 - 0.24 * input.audio.level).toFixed(3)})`
    ctx.fillRect(0, 0, w, h)

    const cx = w / 2
    const cy = h / 2
    const fov = w * 0.7
    const warp = input.audio.surge > 0.4 // hyperspace on a build
    // Extremely beat/kick reactive: the field lurches forward on every hit.
    const speed =
      (0.006 + 0.05 * input.audio.level + 0.16 * input.audio.kick + (warp ? 0.08 : 0)) * intensity
    const hue = (input.timeMs / 30) % 360
    ctx.lineCap = 'round'
    for (const s of stars) {
      const pz = s.z
      s.z -= speed
      if (s.z <= 0.02) {
        resetStar(s)
        continue
      }
      const sx = cx + (s.x / s.z) * fov
      const sy = cy + (s.y / s.z) * fov
      const ox = cx + (s.x / pz) * fov
      const oy = cy + (s.y / pz) * fov
      if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) continue
      const b = Math.min(1, (1 - s.z) * 1.4)
      ctx.strokeStyle = warp
        ? `hsla(${hue}, 90%, ${70 + 25 * b}%, ${b})`
        : `rgba(255,255,255,${b.toFixed(3)})`
      ctx.lineWidth = Math.max(0.6, (1 - s.z) * 3.2)
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.lineTo(sx, sy)
      ctx.stroke()
    }
  }
}

// ---- Neon Grid (synthwave) ------------------------------------------------

let gridScroll = 0
const neonGrid: VisualModule = {
  id: 'grid',
  name: 'Neon Grid',
  usesCamera: false,
  needsPose: false,
  needsFace: false,
  params: [{ key: 'intensity', label: 'Intensity', min: 0.3, max: 2, step: 0.05, default: 1 }],
  render: (ctx, input) => {
    const { w, h } = input
    const intensity = pget(input, 'intensity', 1)
    const horizon = h * 0.52
    // Sky gradient.
    const sky = ctx.createLinearGradient(0, 0, 0, horizon)
    sky.addColorStop(0, '#0a0018')
    sky.addColorStop(1, '#2a0a3a')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, horizon)
    ctx.fillStyle = '#05010a'
    ctx.fillRect(0, horizon, w, h - horizon)

    // Sun with horizontal slats, pulsing with the build/kick.
    const sunR = Math.min(w, h) * (0.16 + 0.05 * input.audio.surge + 0.03 * input.audio.kick)
    const sunX = w / 2
    const sunY = horizon - sunR * 0.35
    const sun = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR)
    sun.addColorStop(0, '#ffd36e')
    sun.addColorStop(0.5, '#ff5db1')
    sun.addColorStop(1, '#c026d3')
    ctx.save()
    ctx.beginPath()
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = sun
    ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2)
    ctx.fillStyle = '#05010a'
    for (let i = 0; i < 7; i++) {
      const yy = sunY + sunR * (0.05 + i * 0.16)
      ctx.fillRect(sunX - sunR, yy, sunR * 2, sunR * (0.03 + i * 0.012))
    }
    ctx.restore()

    // Horizon glow (flares on the beat).
    const beat = Math.max(beatPulse(input.beatPhase), input.audio.kick)
    ctx.strokeStyle = `rgba(255,120,220,${(0.7 + 0.3 * beat).toFixed(3)})`
    ctx.lineWidth = 2 + 7 * beat
    ctx.beginPath()
    ctx.moveTo(0, horizon)
    ctx.lineTo(w, horizon)
    ctx.stroke()

    // Perspective floor grid: rushes toward the viewer on every kick.
    const speed = (0.003 + 0.02 * input.audio.level + 0.06 * input.audio.kick) * intensity
    gridScroll = (gridScroll + speed) % 1
    ctx.strokeStyle = `rgba(0,240,255,${(0.45 + 0.5 * beat).toFixed(3)})`
    ctx.lineWidth = 1.5 + 1.5 * beat
    // Receding horizontal lines (denser toward horizon).
    const rows = 14
    ctx.beginPath()
    for (let k = 0; k < rows; k++) {
      const f = (k + gridScroll) / rows
      const y = horizon + (h - horizon) * f * f
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
    }
    ctx.stroke()
    // Converging vertical lines.
    ctx.beginPath()
    const cols = 14
    for (let i = -cols; i <= cols; i++) {
      const xb = w / 2 + (i / cols) * w * 1.4
      ctx.moveTo(w / 2, horizon)
      ctx.lineTo(xb, h)
    }
    ctx.stroke()
  }
}

// ---- Plasma (fluid color field) -------------------------------------------

const plasma: VisualModule = {
  id: 'plasma',
  name: 'Plasma',
  usesCamera: false,
  needsPose: false,
  needsFace: false,
  params: [{ key: 'intensity', label: 'Intensity', min: 0.3, max: 2, step: 0.05, default: 1 }],
  render: (ctx, input) => {
    const intensity = pget(input, 'intensity', 1)
    const pw = 160
    const ph = Math.max(1, Math.round((pw * input.h) / input.w))
    const c = getScratch('plasma', pw, ph)
    const pctx = c.getContext('2d')
    if (!pctx) return
    const img = pctx.createImageData(pw, ph)
    const d = img.data
    const t = input.timeMs / 1000
    const speed = (1 + 3 * input.audio.level) * intensity
    const bright = 0.7 + 0.7 * Math.max(beatPulse(input.beatPhase), input.audio.kick)
    const hueBase = (input.timeMs / 24 + input.audio.kick * 90) % 360
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const v =
          Math.sin(x * 0.06 + t * speed) +
          Math.sin(y * 0.07 - t * speed * 0.8) +
          Math.sin((x + y) * 0.05 + t) +
          Math.sin(Math.hypot(x - pw / 2, y - ph / 2) * 0.07 - t * 1.4)
        const hue = (hueBase + (v + 4) * 45) % 360
        const [rr, gg, bb] = hslToRgb(hue / 360, 0.75, Math.min(0.62, 0.28 + 0.12 * v) * bright)
        const p = (y * pw + x) * 4
        d[p] = rr
        d[p + 1] = gg
        d[p + 2] = bb
        d[p + 3] = 255
      }
    }
    pctx.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(c, 0, 0, input.w, input.h)
  }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue2 = (tc: number): number => {
    let tt = tc
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  return [Math.round(hue2(h + 1 / 3) * 255), Math.round(hue2(h) * 255), Math.round(hue2(h - 1 / 3) * 255)]
}

// ---- Particles (kick-burst field) -----------------------------------------

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  hue: number
}
const particles: Particle[] = []
let prevKick = 0

const particleField: VisualModule = {
  id: 'particles',
  name: 'Particles',
  usesCamera: false,
  needsPose: false,
  needsFace: false,
  params: [{ key: 'intensity', label: 'Intensity', min: 0.3, max: 2, step: 0.05, default: 1 }],
  render: (ctx, input) => {
    const { w, h } = input
    const intensity = pget(input, 'intensity', 1)
    ctx.fillStyle = `rgba(3,4,12,${(0.28 - 0.14 * input.audio.level).toFixed(3)})`
    ctx.fillRect(0, 0, w, h)

    const kick = input.audio.kick
    const hue = (input.timeMs / 20) % 360
    // Kick edge -> big radial burst from center.
    if (kick > 0.4 && prevKick <= 0.4) {
      const n = Math.round((50 + 90 * input.audio.level) * intensity)
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = (2.5 + Math.random() * 6) * (1 + 1.4 * kick)
        particles.push({
          x: w / 2,
          y: h / 2,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          hue: hue + Math.random() * 40
        })
      }
    }
    prevKick = kick
    // Gentle ambient sparkle so it never goes fully dead.
    if (Math.random() < 0.3 + input.audio.level) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        life: 0.7,
        hue: hue + 180
      })
    }
    if (particles.length > 1400) particles.splice(0, particles.length - 1400)

    ctx.globalCompositeOperation = 'lighter'
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.x += p.vx
      p.y += p.vy
      p.vx *= 0.96
      p.vy *= 0.96
      p.life -= 0.012
      if (p.life <= 0) {
        particles.splice(i, 1)
        continue
      }
      const rad = 1 + 3 * p.life
      ctx.fillStyle = `hsla(${p.hue % 360}, 90%, 65%, ${(p.life * 0.8).toFixed(3)})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }
}

// ---- Trance Rings (minimal concentric mandala pulse) ----------------------

const tranceRings: VisualModule = {
  id: 'rings',
  name: 'Trance Rings',
  usesCamera: false,
  needsPose: false,
  needsFace: false,
  params: [
    { key: 'intensity', label: 'Intensity', min: 0, max: 1.5, step: 0.05, default: 0.6 },
    { key: 'speed', label: 'Speed', min: 0.2, max: 2, step: 0.05, default: 0.8 }
  ],
  render: (ctx, input) => {
    const { w, h } = input
    const intensity = pget(input, 'intensity', 0.6)
    const speed = pget(input, 'speed', 0.8)
    // Gentle trail so rings glide rather than flicker.
    ctx.fillStyle = 'rgba(4,5,10,0.22)'
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'
    const cx = w / 2
    const cy = h / 2
    const maxR = Math.hypot(w, h) / 2
    const beat = beatPulse(input.beatPhase)
    const hue = (input.timeMs / 60) % 360
    const rings = 7
    const phase = (input.timeMs / 3400) * speed
    for (let i = 0; i < rings; i++) {
      const f = (phase + i / rings) % 1
      const rad = f * maxR * (1 + 0.06 * beat)
      const fade = (1 - f) * (0.25 + 0.55 * intensity + 0.4 * beat * intensity)
      ctx.strokeStyle = `hsla(${(hue + i * 12) % 360}, 70%, 65%, ${Math.min(0.9, fade).toFixed(3)})`
      ctx.lineWidth = (1 + 3 * intensity) * (1 - f) + 0.5
      ctx.beginPath()
      ctx.arc(cx, cy, Math.max(0, rad), 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
  }
}

// ---- Outline (minimal rotating line-art) ----------------------------------

const outline: VisualModule = {
  id: 'outline',
  name: 'Outline',
  usesCamera: false,
  needsPose: false,
  needsFace: false,
  params: [
    { key: 'intensity', label: 'Intensity', min: 0, max: 1.5, step: 0.05, default: 0.55 },
    { key: 'count', label: 'Shapes', min: 2, max: 8, step: 1, default: 4 }
  ],
  render: (ctx, input) => {
    const { w, h } = input
    const intensity = pget(input, 'intensity', 0.55)
    const count = Math.round(pget(input, 'count', 4))
    ctx.fillStyle = 'rgba(6,7,12,0.3)'
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2
    const cy = h / 2
    const beat = Math.max(beatPulse(input.beatPhase), input.audio.kick)
    const base = Math.min(w, h) * 0.12
    const hue = (input.timeMs / 90) % 360
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineJoin = 'round'
    for (let i = 0; i < count; i++) {
      const sides = 3 + ((i + 3) % 5) // 3..7-gon
      const rad = base * (1 + i * 0.55) * (1 + 0.1 * beat)
      const rot = input.timeMs / 5200 * (i % 2 ? -1 : 1) + i
      const alpha = (0.18 + 0.5 * intensity) * (1 - i / (count + 2)) + 0.35 * beat * intensity
      ctx.strokeStyle = `hsla(${(hue + i * 24) % 360}, 65%, 62%, ${Math.min(0.9, alpha).toFixed(3)})`
      ctx.lineWidth = 1 + 2 * intensity
      ctx.beginPath()
      for (let k = 0; k <= sides; k++) {
        const a = rot + (k / sides) * Math.PI * 2
        const x = cx + Math.cos(a) * rad
        const y = cy + Math.sin(a) * rad
        if (k === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
  }
}

// ---------------------------------------------------------------------------
// Debug overlays (drawn over any effect from the "Show ___" testing toggles)
// ---------------------------------------------------------------------------

/** Pose landmarks 17-22 are the fingers; we skip them (hands read as noise). */
const isHandLm = (i: number): boolean => i >= 17 && i <= 22

export function drawSkeletonOverlay(ctx: CanvasRenderingContext2D, input: VisualInput): void {
  if (!input.pose?.present) return
  const r = inputRect(input)
  const lm = input.pose.landmarks
  ctx.save()
  ctx.strokeStyle = 'rgba(80,255,120,0.9)'
  ctx.fillStyle = 'rgba(255,80,80,0.95)'
  ctx.lineWidth = Math.max(1.5, input.w / 320)
  ctx.beginPath()
  for (const [a, b] of POSE_BONES) {
    if (isHandLm(a) || isHandLm(b)) continue
    if (lm[a].visibility < 0.35 || lm[b].visibility < 0.35) continue
    ctx.moveTo(mapX(r, lm[a].x), mapY(r, lm[a].y))
    ctx.lineTo(mapX(r, lm[b].x), mapY(r, lm[b].y))
  }
  ctx.stroke()
  const dot = Math.max(2, input.w / 260)
  for (let i = 0; i < lm.length; i++) {
    if (isHandLm(i) || lm[i].visibility < 0.35) continue
    ctx.beginPath()
    ctx.arc(mapX(r, lm[i].x), mapY(r, lm[i].y), dot, 0, Math.PI * 2)
    ctx.fill()
  }

  // Detailed face dots (head shape / expression) when face detection is on.
  const fl = input.face?.present ? input.face.landmarks : null
  if (fl && fl.length > 0) {
    ctx.fillStyle = 'rgba(120,230,255,0.9)'
    const fdot = Math.max(0.9, input.w / 480)
    for (let i = 0; i < fl.length; i++) {
      ctx.beginPath()
      ctx.arc(mapX(r, fl[i].x), mapY(r, fl[i].y), fdot, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

export function drawFaceMeshOverlay(ctx: CanvasRenderingContext2D, input: VisualInput): void {
  if (!input.face?.present) return
  const r = inputRect(input)
  const lm = input.face.landmarks
  if (lm.length === 0) return
  const px = (i: number): number => mapX(r, lm[i].x)
  const py = (i: number): number => mapY(r, lm[i].y)
  ctx.save()
  ctx.lineWidth = Math.max(0.4, input.w / 1100)
  ctx.strokeStyle = 'rgba(60,255,140,0.28)'
  ctx.beginPath()
  for (const c of FACE_TESSELATION) {
    if (c.start >= lm.length || c.end >= lm.length) continue
    ctx.moveTo(px(c.start), py(c.start))
    ctx.lineTo(px(c.end), py(c.end))
  }
  ctx.stroke()
  const colors = [
    'rgba(255,70,90,0.95)',
    'rgba(80,255,140,0.95)',
    'rgba(80,255,140,0.95)',
    'rgba(255,90,90,0.95)',
    'rgba(255,90,90,0.95)',
    'rgba(255,80,100,0.95)',
    'rgba(120,255,180,1)',
    'rgba(120,255,180,1)'
  ]
  for (let ci = 0; ci < FACE_CONTOURS.length; ci++) {
    ctx.strokeStyle = colors[ci] ?? 'rgba(80,255,140,0.9)'
    ctx.lineWidth = Math.max(0.8, input.w / 900)
    ctx.beginPath()
    for (const c of FACE_CONTOURS[ci]) {
      if (c.start >= lm.length || c.end >= lm.length) continue
      ctx.moveTo(px(c.start), py(c.start))
      ctx.lineTo(px(c.end), py(c.end))
    }
    ctx.stroke()
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------

export const VISUALS: VisualModule[] = [
  // Camera-based looks.
  camera,
  mono,
  stickman,
  sketch,
  echo,
  // Generative (no camera) looks.
  starfield,
  neonGrid,
  plasma,
  particleField,
  tranceRings,
  outline
]

export function getVisual(id: string): VisualModule {
  return VISUALS.find((v) => v.id === id) ?? camera
}
