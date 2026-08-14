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

function inputRect(input: VisualInput): Rect {
  return coverRect(input.video?.videoWidth ?? input.w, input.video?.videoHeight ?? input.h, input.w, input.h)
}

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

// ---- Spinning 3D Face (driven by real facial features) --------------------

const spinFace: VisualModule = {
  id: 'spinFace',
  name: 'Spinning Face',
  needsPose: false,
  needsFace: true,
  render: (ctx, input) => {
    ctx.fillStyle = '#04050b'
    ctx.fillRect(0, 0, input.w, input.h)
    if (!input.face?.present) return
    const lm = input.face.landmarks
    if (lm.length === 0) return

    // Centroid so the head spins about its own center.
    let cx = 0
    let cy = 0
    let cz = 0
    for (const p of lm) {
      cx += p.x
      cy += p.y
      cz += p.z
    }
    cx /= lm.length
    cy /= lm.length
    cz /= lm.length

    // Slowly wandering 3D orientation; the pulse speeds the spin + zooms.
    const t = input.timeMs / 1000
    const spinRate = 0.35 + 1.4 * input.audio.level
    const yaw = t * spinRate + 1.6 * Math.sin(t * 0.13)
    const pitch = 0.5 * Math.sin(t * 0.21) + 0.25 * input.audio.surge
    const cosY = Math.cos(yaw)
    const sinY = Math.sin(yaw)
    const cosP = Math.cos(pitch)
    const sinP = Math.sin(pitch)

    const S = Math.min(input.w, input.h) * (0.85 + 0.18 * input.audio.kick)
    const ox = input.w / 2
    const oy = input.h / 2
    const focal = 2.6

    // Project every landmark through yaw->pitch rotation + weak perspective.
    const px = new Float32Array(lm.length)
    const py = new Float32Array(lm.length)
    const pd = new Float32Array(lm.length) // depth for shading
    for (let i = 0; i < lm.length; i++) {
      let X = lm[i].x - cx
      let Y = lm[i].y - cy
      let Z = lm[i].z - cz
      // Yaw about vertical axis.
      const x1 = X * cosY + Z * sinY
      const z1 = -X * sinY + Z * cosY
      // Pitch about horizontal axis.
      const y2 = Y * cosP - z1 * sinP
      const z2 = Y * sinP + z1 * cosP
      X = x1
      Y = y2
      Z = z2
      const persp = focal / (focal - Z)
      px[i] = ox + X * S * persp
      py[i] = oy + Y * S * persp
      pd[i] = Z
    }

    const glow = 0.5 + 0.5 * Math.max(beatPulse(input.beatPhase), input.audio.kick)
    const hue = (input.timeMs / 40) % 360

    // Wireframe tesselation, depth-cued (front brighter than back).
    ctx.lineWidth = Math.max(0.5, input.w / 900)
    for (const c of FACE_TESSELATION) {
      if (c.start >= lm.length || c.end >= lm.length) continue
      const depth = (pd[c.start] + pd[c.end]) / 2
      const a = 0.10 + 0.30 * Math.max(0, 0.5 - depth)
      ctx.strokeStyle = `hsla(${(hue + 140) % 360}, 90%, 60%, ${a.toFixed(3)})`
      ctx.beginPath()
      ctx.moveTo(px[c.start], py[c.start])
      ctx.lineTo(px[c.end], py[c.end])
      ctx.stroke()
    }

    // Feature contours (eyes / brows / lips / irises) pop brighter.
    ctx.shadowColor = `hsl(${hue}, 90%, 60%)`
    ctx.shadowBlur = 8 * glow
    for (let ci = 0; ci < FACE_CONTOURS.length; ci++) {
      const bright = ci >= 6 // irises
      ctx.strokeStyle = bright
        ? `hsla(${hue}, 100%, 75%, 0.95)`
        : `hsla(${(hue + 20) % 360}, 95%, ${52 + 20 * glow}%, 0.9)`
      ctx.lineWidth = Math.max(1, input.w / 700) * (bright ? 1.6 : 1.1)
      ctx.beginPath()
      for (const c of FACE_CONTOURS[ci]) {
        if (c.start >= lm.length || c.end >= lm.length) continue
        ctx.moveTo(px[c.start], py[c.start])
        ctx.lineTo(px[c.end], py[c.end])
      }
      ctx.stroke()
    }
    ctx.shadowBlur = 0
  }
}

// ---- Sketch (edge-detected "ink" outlines) --------------------------------

const sketch: VisualModule = {
  id: 'sketch',
  name: 'Sketch',
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
    const hue = (input.timeMs / 45) % 360
    const rad = (hue * Math.PI) / 180
    const tintR = 180 + 75 * Math.sin(rad)
    const tintG = 180 + 75 * Math.sin(rad + 2.1)
    const tintB = 180 + 75 * Math.sin(rad + 4.2)
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

// ---- Kaleidoscope (mirrored camera wedges) --------------------------------

const kaleidoscope: VisualModule = {
  id: 'kaleido',
  name: 'Kaleidoscope',
  needsPose: false,
  needsFace: false,
  render: (ctx, input) => {
    const { w, h } = input
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    if (!input.video || input.video.readyState < 2) return
    const segments = 6 + 2 * Math.round(input.audio.surge * 3) // 6..12 wedges
    const angle = (Math.PI * 2) / segments
    const cx = w / 2
    const cy = h / 2
    const radius = Math.hypot(w, h) / 2 + 4
    const spin = input.timeMs / 4000 + input.audio.kick * 0.4
    const zoom = 0.9 + 0.25 * input.audio.level
    const r = inputRect(input)

    for (let i = 0; i < segments; i++) {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(spin + i * angle)
      if (i % 2 === 1) ctx.scale(-1, 1) // mirror alternate wedges
      // Clip a triangular wedge from the center.
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(radius * Math.cos(-angle / 2), radius * Math.sin(-angle / 2))
      ctx.lineTo(radius * Math.cos(angle / 2), radius * Math.sin(angle / 2))
      ctx.closePath()
      ctx.clip()
      // Draw the camera sampled off-center so the wedge shows lively detail.
      ctx.scale(zoom, zoom)
      ctx.translate(-cx - r.dw * 0.12, -cy)
      ctx.drawImage(input.video, r.dx, r.dy, r.dw, r.dh)
      ctx.restore()
    }
    // Beat bloom in the middle.
    const bloom = beatPulse(input.beatPhase) * 0.5
    if (bloom > 0.01) {
      ctx.globalCompositeOperation = 'lighter'
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.5)
      grd.addColorStop(0, `rgba(255,255,255,${bloom.toFixed(3)})`)
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grd
      ctx.fillRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'source-over'
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
  needsPose: false,
  needsFace: false,
  render: (ctx, input) => {
    const { w, h } = input
    if (stars.length !== 260) {
      stars = Array.from({ length: 260 }, () => {
        const s = { x: 0, y: 0, z: 0 }
        resetStar(s)
        s.z = Math.random()
        return s
      })
    }
    // Trails: fade toward black (longer streaks when louder).
    ctx.fillStyle = `rgba(2,3,12,${(0.35 - 0.22 * input.audio.level).toFixed(3)})`
    ctx.fillRect(0, 0, w, h)

    const cx = w / 2
    const cy = h / 2
    const fov = w * 0.7
    const warp = input.audio.surge > 0.4 // hyperspace on a build
    const speed = 0.008 + 0.03 * input.audio.level + 0.05 * input.audio.kick + (warp ? 0.06 : 0)
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
  needsPose: false,
  needsFace: false,
  render: (ctx, input) => {
    const { w, h } = input
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

    // Horizon glow.
    ctx.strokeStyle = 'rgba(255,120,220,0.8)'
    ctx.lineWidth = 2 + 3 * input.audio.kick
    ctx.beginPath()
    ctx.moveTo(0, horizon)
    ctx.lineTo(w, horizon)
    ctx.stroke()

    // Perspective floor grid.
    const speed = 0.004 + 0.02 * input.audio.level + 0.03 * input.audio.kick
    gridScroll = (gridScroll + speed) % 1
    ctx.strokeStyle = `rgba(0,240,255,${(0.5 + 0.4 * input.audio.kick).toFixed(3)})`
    ctx.lineWidth = 1.5
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
  needsPose: false,
  needsFace: false,
  render: (ctx, input) => {
    const pw = 160
    const ph = Math.max(1, Math.round((pw * input.h) / input.w))
    const c = getScratch('plasma', pw, ph)
    const pctx = c.getContext('2d')
    if (!pctx) return
    const img = pctx.createImageData(pw, ph)
    const d = img.data
    const t = input.timeMs / 1000
    const speed = 1 + 2 * input.audio.level
    const bright = 0.75 + 0.5 * input.audio.kick
    const hueBase = (input.timeMs / 24) % 360
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
  needsPose: false,
  needsFace: false,
  render: (ctx, input) => {
    const { w, h } = input
    ctx.fillStyle = `rgba(3,4,12,${(0.28 - 0.14 * input.audio.level).toFixed(3)})`
    ctx.fillRect(0, 0, w, h)

    const kick = input.audio.kick
    const hue = (input.timeMs / 20) % 360
    // Kick edge -> radial burst from center.
    if (kick > 0.45 && prevKick <= 0.45) {
      const n = 40 + Math.round(60 * input.audio.level)
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = (2 + Math.random() * 5) * (1 + kick)
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

// ---------------------------------------------------------------------------
// Debug overlays (drawn over any effect from the "Show ___" testing toggles)
// ---------------------------------------------------------------------------

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
    if (lm[a].visibility < 0.35 || lm[b].visibility < 0.35) continue
    ctx.moveTo(mapX(r, lm[a].x), mapY(r, lm[a].y))
    ctx.lineTo(mapX(r, lm[b].x), mapY(r, lm[b].y))
  }
  ctx.stroke()
  const dot = Math.max(2, input.w / 260)
  for (const p of lm) {
    if (p.visibility < 0.35) continue
    ctx.beginPath()
    ctx.arc(mapX(r, p.x), mapY(r, p.y), dot, 0, Math.PI * 2)
    ctx.fill()
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
  camera,
  mono,
  stickman,
  spinFace,
  sketch,
  echo,
  kaleidoscope,
  starfield,
  neonGrid,
  plasma,
  particleField
]

export function getVisual(id: string): VisualModule {
  return VISUALS.find((v) => v.id === id) ?? camera
}
