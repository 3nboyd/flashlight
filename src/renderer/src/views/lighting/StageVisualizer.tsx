import { useCallback, useEffect, useRef, type JSX } from 'react'
import { useLightingStore } from '../../state/lightingStore'
import { fixturesById } from '@core/lighting/fixtures/library'
import {
  readFixtureVisualState,
  resolveStagePositions,
  type FixtureVisualState,
  type StagePosition
} from '@core/lighting/visualizer/fixtureVisualState'
import type { PatchedFixture } from '@core/lighting/fixtures/types'

/**
 * 2.5D live stage preview. Draws the rig — truss across the top, floor
 * uplights below, a DJ booth center stage — and renders every fixture's
 * current output as additive light: beam cones with bright cores, lens
 * glows, floor pools, strobe flicker, and laser fans. Data comes from the
 * engine's on-demand snapshot, so the preview is identical whether DMX
 * output is running or not.
 *
 * In `editable` mode fixtures can be dragged: horizontally to reposition,
 * vertically past the midline to move between truss and floor.
 */

interface StageVisualizerProps {
  height: number
  editable?: boolean
  /** Fired on empty-area click (used by the mini view to expand). */
  onBackgroundClick?: () => void
  className?: string
}

interface DragState {
  patchId: string
  moved: boolean
}

const TRUSS_Y = 0.16
const FLOOR_Y = 0.82

export function StageVisualizer({
  height,
  editable = false,
  onBackgroundClick,
  className
}: StageVisualizerProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const snapshotRef = useRef<Record<number, number[]>>({})
  const positionsRef = useRef<Map<string, StagePosition>>(new Map())
  const dragRef = useRef<DragState | null>(null)
  const { project, updateProject } = useLightingStore()
  const projectRef = useRef(project)
  projectRef.current = project

  // Poll the engine's snapshot at ~30fps while mounted.
  useEffect(() => {
    let cancelled = false
    const interval = setInterval(async () => {
      try {
        const snapshot = await window.djCompanion.lighting.getUniverseSnapshot()
        if (!cancelled) snapshotRef.current = snapshot
      } catch {
        // Engine unavailable; keep last frame.
      }
    }, 33)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // Keep resolved positions in sync with the project (unless mid-drag).
  useEffect(() => {
    if (dragRef.current) return
    positionsRef.current = resolveStagePositions(project.patches, fixturesById(project.customFixtures))
  }, [project.patches, project.customFixtures])

  const resolveFixtures = useCallback((): PatchedFixture[] => {
    const defs = fixturesById(projectRef.current.customFixtures)
    return projectRef.current.patches
      .map((patch) => {
        const definition = defs.get(patch.definitionId)
        return definition ? { patch, definition } : null
      })
      .filter((f): f is PatchedFixture => f !== null)
  }, [])

  // Render loop.
  useEffect(() => {
    let raf = 0
    const draw = (): void => {
      raf = requestAnimationFrame(draw)
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      const cssWidth = canvas.clientWidth
      const cssHeight = canvas.clientHeight
      if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
        canvas.width = cssWidth * dpr
        canvas.height = cssHeight * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      renderStage(ctx, cssWidth, cssHeight, {
        fixtures: resolveFixtures(),
        snapshot: snapshotRef.current,
        positions: positionsRef.current,
        editable,
        timeMs: performance.now()
      })
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [editable, resolveFixtures])

  // ---- drag-to-position (editable mode) ----

  const hitTest = useCallback(
    (mx: number, my: number, width: number, h: number): string | null => {
      for (const [patchId, pos] of positionsRef.current) {
        const fx = pos.x * width
        const fy = (pos.level === 'truss' ? TRUSS_Y : FLOOR_Y) * h
        if (Math.abs(mx - fx) < 16 && Math.abs(my - fy) < 20) return patchId
      }
      return null
    },
    []
  )

  function pointer(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    const { x, y } = pointer(e)
    const hit = hitTest(x, y, e.currentTarget.clientWidth, e.currentTarget.clientHeight)
    if (hit && editable) {
      dragRef.current = { patchId: hit, moved: false }
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    const canvas = e.currentTarget
    const { x, y } = pointer(e)
    if (dragRef.current) {
      dragRef.current.moved = true
      const nx = Math.min(0.97, Math.max(0.03, x / canvas.clientWidth))
      const level: StagePosition['level'] = y < canvas.clientHeight * 0.5 ? 'truss' : 'floor'
      positionsRef.current.set(dragRef.current.patchId, { x: nx, level })
      canvas.style.cursor = 'grabbing'
      return
    }
    if (editable) {
      const hit = hitTest(x, y, canvas.clientWidth, canvas.clientHeight)
      canvas.style.cursor = hit ? 'grab' : 'default'
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>): void {
    const drag = dragRef.current
    dragRef.current = null
    if (drag && drag.moved) {
      const pos = positionsRef.current.get(drag.patchId)
      if (pos) {
        updateProject((p) => ({
          ...p,
          patches: p.patches.map((patch) =>
            patch.id === drag.patchId ? { ...patch, stage: { ...pos } } : patch
          )
        }))
      }
      return
    }
    if (!drag && onBackgroundClick) {
      const { x, y } = pointer(e)
      const hit = hitTest(x, y, e.currentTarget.clientWidth, e.currentTarget.clientHeight)
      if (!hit) onBackgroundClick()
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ height, width: '100%', display: 'block', borderRadius: 12 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  )
}

// ---------------------------------------------------------------------------
// Canvas rendering
// ---------------------------------------------------------------------------

interface RenderContext {
  fixtures: PatchedFixture[]
  snapshot: Record<number, number[]>
  positions: Map<string, StagePosition>
  editable: boolean
  timeMs: number
}

function renderStage(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rc: RenderContext
): void {
  // --- room ---
  const bg = ctx.createLinearGradient(0, 0, 0, height)
  bg.addColorStop(0, '#08080c')
  bg.addColorStop(0.75, '#0d0d13')
  bg.addColorStop(1, '#14141c')
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  const floorY = FLOOR_Y * height
  const trussY = TRUSS_Y * height

  // Floor with perspective grid.
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, floorY)
  ctx.lineTo(width, floorY)
  ctx.stroke()
  const vanishX = width / 2
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * width
    ctx.beginPath()
    ctx.moveTo(x, floorY)
    ctx.lineTo(vanishX + (x - vanishX) * 1.6, height)
    ctx.stroke()
  }
  for (let i = 1; i <= 3; i++) {
    const y = floorY + ((height - floorY) * i) / 3.4
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }

  // Truss: two rails + lattice.
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = 1.5
  const railGap = Math.max(5, height * 0.02)
  for (const dy of [-railGap / 2, railGap / 2]) {
    ctx.beginPath()
    ctx.moveTo(width * 0.02, trussY + dy)
    ctx.lineTo(width * 0.98, trussY + dy)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  const lattice = Math.max(14, width / 48)
  for (let x = width * 0.02; x < width * 0.98 - lattice; x += lattice) {
    ctx.beginPath()
    ctx.moveTo(x, trussY - railGap / 2)
    ctx.lineTo(x + lattice, trussY + railGap / 2)
    ctx.moveTo(x + lattice, trussY - railGap / 2)
    ctx.lineTo(x, trussY + railGap / 2)
    ctx.stroke()
  }

  // DJ booth prop, center stage.
  drawBooth(ctx, width / 2, floorY, Math.min(width * 0.16, 150), height)

  // --- fixture states ---
  const states: { state: FixtureVisualState; pos: StagePosition }[] = []
  for (const fixture of rc.fixtures) {
    const data = rc.snapshot[fixture.patch.universe]
    const pos = rc.positions.get(fixture.patch.id)
    if (!pos) continue
    const state = data
      ? readFixtureVisualState(Uint8Array.from(data), fixture)
      : emptyState(fixture)
    states.push({ state, pos })
  }

  // --- light pass (additive) ---
  ctx.globalCompositeOperation = 'lighter'
  states.forEach(({ state, pos }, index) => {
    const fx = pos.x * width
    const fy = (pos.level === 'truss' ? trussY + railGap : floorY) + 0
    let alpha = state.intensity
    if (state.strobing && alpha > 0) {
      // ~12Hz flicker, phase-offset per fixture so a strobe wall shimmers.
      alpha *= Math.floor(rc.timeMs / 42 + index * 2.7) % 2 === 0 ? 1 : 0.06
    }
    if (alpha <= 0.01) return

    if (state.kind === 'laser') {
      drawLaserFan(ctx, fx, fy, pos.level, state, alpha, rc.timeMs, height)
    } else if (state.kind === 'derby') {
      drawDerby(ctx, fx, fy, pos.level, state, alpha, rc.timeMs, height)
    } else if (state.kind === 'fog') {
      drawFogPuff(ctx, fx, fy, alpha, rc.timeMs, height)
    } else if (state.segments && state.segments.length > 1) {
      drawSegmentBar(ctx, fx, fy, pos.level, state, alpha, width, height, floorY, state.kind === 'movingBar')
    } else {
      drawBeam(ctx, fx, fy, pos.level, state, alpha, width, height, floorY)
    }
  })

  // --- fixture bodies (normal blend, on top of light) ---
  ctx.globalCompositeOperation = 'source-over'
  states.forEach(({ state, pos }) => {
    const fx = pos.x * width
    const fy = pos.level === 'truss' ? trussY + railGap : floorY
    drawFixtureBody(ctx, fx, fy, pos.level, state, rc.editable, height)
  })
}

function emptyState(fixture: PatchedFixture): FixtureVisualState {
  return {
    patchId: fixture.patch.id,
    label: fixture.patch.label,
    kind: fixture.definition.kind,
    r: 0,
    g: 0,
    b: 0,
    intensity: 0,
    strobing: false,
    pan: null,
    tilt: null,
    segments: null
  }
}

function beamAngle(state: FixtureVisualState, level: StagePosition['level'], x: number, width: number): number {
  // Angle in radians from the fixture's rest direction (down for truss, up for floor).
  if (state.pan !== null) {
    return (state.pan - 0.5) * 1.9 // movers: pan sweeps the beam
  }
  // Static fixtures lean gently toward center stage for a fuller look.
  const lean = (x / width - 0.5) * -0.35
  return level === 'floor' ? lean : -lean
}

function drawBeam(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  level: StagePosition['level'],
  state: FixtureVisualState,
  alpha: number,
  width: number,
  height: number,
  floorY: number
): void {
  const down = level === 'truss'
  const baseDir = down ? Math.PI / 2 : -Math.PI / 2 // straight down / up
  const angle = baseDir + beamAngle(state, level, fx, width) * (down ? 1 : -1)
  // Movers' tilt stretches or shortens the visible throw.
  const tiltFactor = state.tilt !== null ? 0.65 + state.tilt * 0.7 : 1
  const length = (down ? floorY - fy : fy - 0) * 0.98 * tiltFactor
  const halfWidthFar = length * 0.3

  const tipX = fx + Math.cos(angle) * length
  const tipY = fy + Math.sin(angle) * length
  const perpX = -Math.sin(angle)
  const perpY = Math.cos(angle)

  const color = (a: number): string =>
    `rgba(${Math.round(state.r * 255)},${Math.round(state.g * 255)},${Math.round(state.b * 255)},${a})`

  // Wide soft cone + narrow bright core.
  for (const [spread, coneAlpha] of [
    [1, 0.16],
    [0.45, 0.22]
  ] as const) {
    const hw = halfWidthFar * spread
    const grad = ctx.createLinearGradient(fx, fy, tipX, tipY)
    grad.addColorStop(0, color(alpha * coneAlpha * 1.4))
    grad.addColorStop(1, color(alpha * coneAlpha * 0.12))
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(fx, fy)
    ctx.lineTo(tipX + perpX * hw, tipY + perpY * hw)
    ctx.lineTo(tipX - perpX * hw, tipY - perpY * hw)
    ctx.closePath()
    ctx.fill()
  }

  // Lens glow at the source.
  const glowR = Math.max(6, height * 0.045) * (0.6 + alpha * 0.7)
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, glowR)
  glow.addColorStop(0, color(alpha * 0.9))
  glow.addColorStop(1, color(0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(fx, fy, glowR, 0, Math.PI * 2)
  ctx.fill()

  // Floor pool where a downward beam lands.
  if (down) {
    const poolX = Math.min(width, Math.max(0, tipX))
    const poolW = halfWidthFar * 1.4
    const pool = ctx.createRadialGradient(poolX, floorY, 0, poolX, floorY, poolW)
    pool.addColorStop(0, color(alpha * 0.28))
    pool.addColorStop(1, color(0))
    ctx.save()
    ctx.translate(poolX, floorY)
    ctx.scale(1, 0.22)
    ctx.translate(-poolX, -floorY)
    ctx.fillStyle = pool
    ctx.beginPath()
    ctx.arc(poolX, floorY, poolW, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  } else {
    // Uplights wash the "ceiling" area softly.
    const washR = halfWidthFar * 1.1
    const wash = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, washR)
    wash.addColorStop(0, color(alpha * 0.12))
    wash.addColorStop(1, color(0))
    ctx.fillStyle = wash
    ctx.beginPath()
    ctx.arc(tipX, tipY, washR, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Width of a multi-cell bar fixture on screen. */
function barWidth(segCount: number, height: number): number {
  return Math.min(segCount * Math.max(10, height * 0.05), height * 0.9)
}

/**
 * Multi-cell fixtures: pixel bars render a beam per cell in the cell's own
 * color; wave bars additionally angle each cell's beam with its live tilt,
 * producing the signature ripple.
 */
function drawSegmentBar(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  level: StagePosition['level'],
  state: FixtureVisualState,
  alpha: number,
  _width: number,
  height: number,
  floorY: number,
  movingBar: boolean
): void {
  const segs = state.segments!
  const total = barWidth(segs.length, height)
  const cellW = total / segs.length
  const down = level === 'truss'
  const baseDir = down ? Math.PI / 2 : -Math.PI / 2

  segs.forEach((seg, i) => {
    const segAlpha = alpha <= 0 ? 0 : Math.max(0, Math.min(1, seg.intensity)) * (state.strobing ? alpha / Math.max(state.intensity, 0.01) : 1)
    if (segAlpha <= 0.02) return
    const cx = fx - total / 2 + cellW * (i + 0.5)
    const tiltAngle = movingBar && seg.tilt !== null ? (seg.tilt - 0.5) * 1.6 : 0
    const angle = baseDir + tiltAngle
    const length = (down ? floorY - fy : fy) * 0.9
    const tipX = cx + Math.cos(angle) * length
    const tipY = fy + Math.sin(angle) * length
    const perpX = -Math.sin(angle)
    const perpY = Math.cos(angle)
    const hw = Math.max(cellW * 0.5, length * 0.06)

    const color = (a: number): string =>
      `rgba(${Math.round(seg.r * 255)},${Math.round(seg.g * 255)},${Math.round(seg.b * 255)},${a})`
    const grad = ctx.createLinearGradient(cx, fy, tipX, tipY)
    grad.addColorStop(0, color(segAlpha * 0.35))
    grad.addColorStop(1, color(segAlpha * 0.03))
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(cx, fy)
    ctx.lineTo(tipX + perpX * hw, tipY + perpY * hw)
    ctx.lineTo(tipX - perpX * hw, tipY - perpY * hw)
    ctx.closePath()
    ctx.fill()

    // Cell lens glow.
    const glowR = Math.max(3, cellW * 0.55)
    const glow = ctx.createRadialGradient(cx, fy, 0, cx, fy, glowR)
    glow.addColorStop(0, color(segAlpha * 0.95))
    glow.addColorStop(1, color(0))
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, fy, glowR, 0, Math.PI * 2)
    ctx.fill()
  })
}

/** Derby/moonflower: a rotating cluster of narrow beams from one head. */
function drawDerby(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  level: StagePosition['level'],
  state: FixtureVisualState,
  alpha: number,
  timeMs: number,
  height: number
): void {
  const down = level === 'truss'
  const baseDir = down ? Math.PI / 2 : -Math.PI / 2
  const spin = (timeMs / 900) % (Math.PI * 2)
  const beams = 6
  const length = height * 0.55
  const color = (a: number): string =>
    `rgba(${Math.round(state.r * 255)},${Math.round(state.g * 255)},${Math.round(state.b * 255)},${a})`

  for (let i = 0; i < beams; i++) {
    // Beams sweep back and forth as the derby barrel rotates.
    const offset = Math.sin(spin + (i * Math.PI * 2) / beams) * 0.85
    const angle = baseDir + offset
    const tipX = fx + Math.cos(angle) * length
    const tipY = fy + Math.sin(angle) * length
    const perpX = -Math.sin(angle)
    const perpY = Math.cos(angle)
    const hw = length * 0.045

    const grad = ctx.createLinearGradient(fx, fy, tipX, tipY)
    grad.addColorStop(0, color(alpha * 0.4))
    grad.addColorStop(1, color(alpha * 0.04))
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(fx, fy)
    ctx.lineTo(tipX + perpX * hw, tipY + perpY * hw)
    ctx.lineTo(tipX - perpX * hw, tipY - perpY * hw)
    ctx.closePath()
    ctx.fill()
  }

  const glowR = Math.max(6, height * 0.04)
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, glowR)
  glow.addColorStop(0, color(alpha * 0.9))
  glow.addColorStop(1, color(0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(fx, fy, glowR, 0, Math.PI * 2)
  ctx.fill()
}

/** DMX fog machine: a drifting gray puff while output is up. */
function drawFogPuff(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  alpha: number,
  timeMs: number,
  height: number
): void {
  const drift = (timeMs / 40) % (height * 0.4)
  for (let i = 0; i < 3; i++) {
    const r = height * (0.08 + i * 0.06) + drift * (0.5 + i * 0.3)
    const cy = fy - height * 0.04 - drift * (0.4 + i * 0.2)
    const puff = ctx.createRadialGradient(fx, cy, 0, fx, cy, r)
    const a = alpha * 0.1 * (1 - drift / (height * 0.45))
    puff.addColorStop(0, `rgba(180,180,195,${Math.max(0, a)})`)
    puff.addColorStop(1, 'rgba(180,180,195,0)')
    ctx.fillStyle = puff
    ctx.beginPath()
    ctx.arc(fx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawLaserFan(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  level: StagePosition['level'],
  state: FixtureVisualState,
  alpha: number,
  timeMs: number,
  height: number
): void {
  const down = level === 'truss'
  const baseDir = down ? Math.PI / 2 : -Math.PI / 2
  const rays = 7
  const fan = 0.9
  const wobble = Math.sin(timeMs / 700) * 0.18
  const length = height * (down ? 0.75 : 0.85)
  ctx.lineWidth = 1.2
  for (let i = 0; i < rays; i++) {
    const t = i / (rays - 1)
    const angle = baseDir + (t - 0.5) * fan + wobble
    const grad = ctx.createLinearGradient(fx, fy, fx + Math.cos(angle) * length, fy + Math.sin(angle) * length)
    const c = `rgba(${Math.round(state.r * 255)},${Math.round(state.g * 255)},${Math.round(state.b * 255)},`
    grad.addColorStop(0, `${c}${alpha * 0.9})`)
    grad.addColorStop(1, `${c}${alpha * 0.15})`)
    ctx.strokeStyle = grad
    ctx.beginPath()
    ctx.moveTo(fx, fy)
    ctx.lineTo(fx + Math.cos(angle) * length, fy + Math.sin(angle) * length)
    ctx.stroke()
  }
}

function drawFixtureBody(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  level: StagePosition['level'],
  state: FixtureVisualState,
  editable: boolean,
  height: number
): void {
  const s = Math.max(5, height * 0.028) // base size unit
  ctx.fillStyle = '#26262e'
  ctx.strokeStyle = editable ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1

  if (state.kind === 'movingHead') {
    // Yoke arm + head that leans with pan.
    const lean = state.pan !== null ? (state.pan - 0.5) * 0.9 : 0
    ctx.save()
    ctx.translate(fx, fy)
    ctx.rotate(level === 'truss' ? lean : -lean)
    ctx.fillRect(-s * 0.35, level === 'truss' ? 0 : -s * 1.1, s * 0.7, s * 1.1) // yoke
    ctx.beginPath()
    ctx.ellipse(0, level === 'truss' ? s * 1.35 : -s * 1.35, s * 0.8, s * 1.05, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  } else if (state.kind === 'strobe') {
    ctx.fillRect(fx - s * 1.2, fy - s * 0.35, s * 2.4, s * 0.9)
    ctx.strokeRect(fx - s * 1.2, fy - s * 0.35, s * 2.4, s * 0.9)
  } else if (state.kind === 'laser') {
    ctx.fillRect(fx - s * 0.8, fy - s * 0.5, s * 1.6, s)
    ctx.strokeRect(fx - s * 0.8, fy - s * 0.5, s * 1.6, s)
  } else if (state.segments && state.segments.length > 1) {
    // Bar chassis with visible cells.
    const total = barWidth(state.segments.length, height)
    const cellW = total / state.segments.length
    ctx.beginPath()
    ctx.roundRect(fx - total / 2, fy - s * 0.45, total, s * 0.9, 2)
    ctx.fill()
    ctx.stroke()
    state.segments.forEach((_, i) => {
      const cx = fx - total / 2 + cellW * (i + 0.5)
      ctx.beginPath()
      ctx.arc(cx, fy, Math.min(cellW * 0.3, s * 0.32), 0, Math.PI * 2)
      ctx.stroke()
    })
  } else if (state.kind === 'derby') {
    // Dome.
    ctx.beginPath()
    ctx.arc(fx, fy, s * 0.9, level === 'truss' ? 0 : Math.PI, level === 'truss' ? Math.PI : Math.PI * 2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else if (state.kind === 'scanner') {
    // Body + angled mirror.
    ctx.fillRect(fx - s * 1.1, fy - s * 0.4, s * 2.2, s * 0.8)
    ctx.strokeRect(fx - s * 1.1, fy - s * 0.4, s * 2.2, s * 0.8)
    ctx.beginPath()
    ctx.moveTo(fx + s * 1.1, fy)
    ctx.lineTo(fx + s * 1.7, fy + (level === 'truss' ? s * 0.7 : -s * 0.7))
    ctx.stroke()
  } else if (state.kind === 'fog') {
    ctx.fillRect(fx - s * 1.3, fy - s * 0.7, s * 2.6, s * 0.7)
    ctx.strokeRect(fx - s * 1.3, fy - s * 0.7, s * 2.6, s * 0.7)
  } else {
    // Par can: wedge pointing away from its mount.
    ctx.save()
    ctx.translate(fx, fy)
    if (level === 'truss') ctx.rotate(Math.PI)
    ctx.beginPath()
    ctx.moveTo(-s * 0.9, 0)
    ctx.lineTo(-s * 0.55, -s * 1.15)
    ctx.lineTo(s * 0.55, -s * 1.15)
    ctx.lineTo(s * 0.9, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
}

function drawBooth(
  ctx: CanvasRenderingContext2D,
  cx: number,
  floorY: number,
  boothWidth: number,
  height: number
): void {
  const boothH = Math.max(14, height * 0.14)
  ctx.fillStyle = '#191920'
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1
  // Table
  const x = cx - boothWidth / 2
  const y = floorY - boothH
  ctx.beginPath()
  ctx.roundRect(x, y, boothWidth, boothH, 3)
  ctx.fill()
  ctx.stroke()
  // Laptop silhouette
  const lw = boothWidth * 0.22
  ctx.fillStyle = '#22222b'
  ctx.beginPath()
  ctx.roundRect(cx - lw / 2, y - boothH * 0.42, lw, boothH * 0.42, 2)
  ctx.fill()
  ctx.stroke()
  // Deck circles
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  for (const dx of [-boothWidth * 0.3, boothWidth * 0.3]) {
    ctx.beginPath()
    ctx.arc(cx + dx, y + boothH * 0.45, boothH * 0.28, 0, Math.PI * 2)
    ctx.stroke()
  }
}
