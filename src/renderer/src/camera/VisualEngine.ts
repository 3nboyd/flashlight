import { POSE_BONES, POSE, type PoseFrame } from './PoseEngine'
import type { PoseFeatureState } from './PoseFeatures'

/**
 * The camera visual-FX engine: a library of "visual" modules that render one
 * frame to a canvas from the live camera + detected pose + music. Some turn the
 * DJ into shapes or wireframes; others work with just the camera or nothing at
 * all (person-free, music-reactive). Canvas2D for now; heavier looks can move to
 * WebGL later behind the same interface.
 */

export interface VisualInput {
  video: HTMLVideoElement | null
  pose: PoseFrame | null
  features: PoseFeatureState
  timeMs: number
  /** 0-1 beat position from the lighting clock (tempo/music sync). */
  beatPhase: number
  /** 0-1 coarse loudness (music reactive). */
  audio: number
  w: number
  h: number
}

export interface VisualModule {
  id: string
  name: string
  /** Needs a detected person to look right (drives detection on when active). */
  needsPerson: boolean
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

function drawVideoCover(ctx: CanvasRenderingContext2D, input: VisualInput): Rect {
  const v = input.video
  if (!v || v.readyState < 2) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, input.w, input.h)
    return { dx: 0, dy: 0, dw: input.w, dh: input.h }
  }
  const r = coverRect(v.videoWidth, v.videoHeight, input.w, input.h)
  ctx.drawImage(v, r.dx, r.dy, r.dw, r.dh)
  return r
}

const mapX = (r: Rect, x: number): number => r.dx + x * r.dw
const mapY = (r: Rect, y: number): number => r.dy + y * r.dh

/** Beat-synced pulse 0..1 (sharp on the downbeat). */
function beatPulse(beatPhase: number): number {
  return Math.pow(1 - beatPhase, 2)
}

const camera: VisualModule = {
  id: 'camera',
  name: 'Camera',
  needsPerson: false,
  render: (ctx, input) => {
    drawVideoCover(ctx, input)
  }
}

const mono: VisualModule = {
  id: 'mono',
  name: 'Black & White',
  needsPerson: false,
  render: (ctx, input) => {
    const contrast = 1.2 + 0.5 * input.audio
    ctx.filter = `grayscale(1) contrast(${contrast})`
    drawVideoCover(ctx, input)
    ctx.filter = 'none'
  }
}

const wireframe: VisualModule = {
  id: 'wireframe',
  name: 'Wireframe',
  needsPerson: true,
  render: (ctx, input) => {
    ctx.fillStyle = '#05060a'
    ctx.fillRect(0, 0, input.w, input.h)
    if (!input.pose?.present) return
    const r = coverRect(
      input.video?.videoWidth ?? input.w,
      input.video?.videoHeight ?? input.h,
      input.w,
      input.h
    )
    const lm = input.pose.landmarks
    const glow = 0.5 + 0.5 * beatPulse(input.beatPhase)
    const hue = (input.timeMs / 40) % 360
    ctx.lineWidth = Math.max(3, input.w / 160) * (0.8 + 0.6 * glow)
    ctx.strokeStyle = `hsl(${hue}, 90%, ${45 + 25 * glow}%)`
    ctx.shadowColor = ctx.strokeStyle
    ctx.shadowBlur = 18 * glow
    ctx.beginPath()
    for (const [a, b] of POSE_BONES) {
      if (lm[a].visibility < 0.35 || lm[b].visibility < 0.35) continue
      ctx.moveTo(mapX(r, lm[a].x), mapY(r, lm[a].y))
      ctx.lineTo(mapX(r, lm[b].x), mapY(r, lm[b].y))
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }
}

const shapes: VisualModule = {
  id: 'shapes',
  name: 'Geometric',
  needsPerson: true,
  render: (ctx, input) => {
    ctx.fillStyle = '#07040d'
    ctx.fillRect(0, 0, input.w, input.h)
    if (!input.pose?.present) return
    const r = coverRect(
      input.video?.videoWidth ?? input.w,
      input.video?.videoHeight ?? input.h,
      input.w,
      input.h
    )
    const lm = input.pose.landmarks
    const pulse = beatPulse(input.beatPhase)
    const base = input.w / 22
    const joints: { i: number; s: number; sides: number }[] = [
      { i: POSE.nose, s: 1.6, sides: 0 },
      { i: POSE.leftWrist, s: 1.2, sides: 3 },
      { i: POSE.rightWrist, s: 1.2, sides: 3 },
      { i: POSE.leftElbow, s: 0.8, sides: 4 },
      { i: POSE.rightElbow, s: 0.8, sides: 4 },
      { i: POSE.leftShoulder, s: 0.9, sides: 6 },
      { i: POSE.rightShoulder, s: 0.9, sides: 6 },
      { i: POSE.leftKnee, s: 0.8, sides: 5 },
      { i: POSE.rightKnee, s: 0.8, sides: 5 }
    ]
    // Limb connectors.
    ctx.strokeStyle = 'rgba(120,180,255,0.5)'
    ctx.lineWidth = base * 0.25
    ctx.beginPath()
    for (const [a, b] of POSE_BONES) {
      if (lm[a].visibility < 0.35 || lm[b].visibility < 0.35) continue
      ctx.moveTo(mapX(r, lm[a].x), mapY(r, lm[a].y))
      ctx.lineTo(mapX(r, lm[b].x), mapY(r, lm[b].y))
    }
    ctx.stroke()
    for (const j of joints) {
      const p = lm[j.i]
      if (p.visibility < 0.35) continue
      const x = mapX(r, p.x)
      const y = mapY(r, p.y)
      const rad = base * j.s * (0.85 + 0.3 * pulse)
      const hue = (input.timeMs / 25 + j.i * 20) % 360
      ctx.fillStyle = `hsla(${hue}, 85%, 60%, 0.92)`
      ctx.beginPath()
      if (j.sides === 0) {
        ctx.arc(x, y, rad, 0, Math.PI * 2)
      } else {
        for (let k = 0; k <= j.sides; k++) {
          const ang = (k / j.sides) * Math.PI * 2 + input.timeMs / 1000
          const px = x + Math.cos(ang) * rad
          const py = y + Math.sin(ang) * rad
          if (k === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
      }
      ctx.fill()
    }
  }
}

const pulseRings: VisualModule = {
  id: 'pulseRings',
  name: 'Pulse Rings',
  needsPerson: false,
  render: (ctx, input) => {
    // Darkened camera (or black) with beat/music/motion-reactive rings - works
    // with or without a person on screen.
    ctx.fillStyle = 'rgba(4,4,10,0.9)'
    if (input.video && input.video.readyState >= 2) {
      ctx.globalAlpha = 0.35
      drawVideoCover(ctx, input)
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgba(4,4,10,0.5)'
    }
    ctx.fillRect(0, 0, input.w, input.h)
    const cx = input.pose?.present ? mapXCenter(input) : input.w / 2
    const cy = input.h / 2
    const energy = Math.max(input.audio, input.features.motion, beatPulse(input.beatPhase))
    const rings = 5
    for (let i = 0; i < rings; i++) {
      const t = ((input.timeMs / 1200 + i / rings) % 1)
      const rad = t * Math.max(input.w, input.h) * (0.6 + 0.4 * energy)
      const hue = (input.timeMs / 20 + i * 40) % 360
      ctx.strokeStyle = `hsla(${hue}, 90%, 60%, ${(1 - t) * (0.3 + 0.7 * energy)})`
      ctx.lineWidth = 2 + 10 * energy * (1 - t)
      ctx.beginPath()
      ctx.arc(cx, cy, rad, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}

function mapXCenter(input: VisualInput): number {
  const r = coverRect(input.video?.videoWidth ?? input.w, input.video?.videoHeight ?? input.h, input.w, input.h)
  return mapX(r, input.features.centerX)
}

export const VISUALS: VisualModule[] = [camera, mono, wireframe, shapes, pulseRings]

export function getVisual(id: string): VisualModule {
  return VISUALS.find((v) => v.id === id) ?? camera
}
