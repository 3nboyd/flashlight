import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useLightingStore } from '../../state/lightingStore'
import { fixturesById } from '@core/lighting/fixtures/library'
import {
  readFixtureVisualState,
  resolveStagePositions,
  type FixtureVisualState,
  type StagePosition
} from '@core/lighting/visualizer/fixtureVisualState'
import type { PatchedFixture } from '@core/lighting/fixtures/types'
import type { StageProp, StagePropType } from '@core/lighting/engine/types'

/**
 * 2.5D live stage preview and rig playground. Draws the venue — top truss,
 * optional vertical trusses, speakers, DJ booth, risers — and renders every
 * fixture's current output as additive light: beam cones, lens glows, floor
 * pools, strobe flicker, laser fans, derby clusters, per-cell bar beams.
 * Data comes from the engine's on-demand snapshot, so the preview is
 * identical whether DMX output is running or not.
 *
 * In `editable` mode it's a playground: drag fixtures anywhere (they snap
 * to the top truss, the floor, or a vertical truss), drag props around,
 * drop anything on the trash bin to remove it, and add set pieces from the
 * floating + button.
 */

interface StageVisualizerProps {
  height: number
  editable?: boolean
  /** Fired on empty-area click (used by the mini view to expand). */
  onBackgroundClick?: () => void
  className?: string
}

type DragTarget = { type: 'fixture'; id: string } | { type: 'prop'; id: string }

interface DragState {
  target: DragTarget
  moved: boolean
  /** Current pointer position (canvas coords) while dragging. */
  px: number
  py: number
}

const TRUSS_Y = 0.16
const FLOOR_Y = 0.82

const PROP_CHOICES: { type: StagePropType; label: string; hint: string }[] = [
  { type: 'vtruss', label: 'Vertical Truss', hint: 'Mount fixtures up its side' },
  { type: 'speaker', label: 'Speaker Stack', hint: 'Set dressing' },
  { type: 'booth', label: 'DJ Booth', hint: 'Set dressing' },
  { type: 'riser', label: 'Riser', hint: 'Low platform' }
]

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
  const propDragXRef = useRef<Map<string, number>>(new Map())
  const [pickerOpen, setPickerOpen] = useState(false)
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

  const currentProps = useCallback((): StageProp[] => {
    const overrides = propDragXRef.current
    return projectRef.current.stageProps.map((prop) =>
      overrides.has(prop.id) ? { ...prop, x: overrides.get(prop.id)! } : prop
    )
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
        props: currentProps(),
        editable,
        dragging: dragRef.current,
        timeMs: performance.now()
      })
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [editable, resolveFixtures, currentProps])

  // ---- geometry helpers shared with rendering ----

  const fixtureScreenPos = useCallback(
    (pos: StagePosition, width: number, h: number): { x: number; y: number } => {
      const trussY = TRUSS_Y * h
      const floorY = FLOOR_Y * h
      if (pos.level === 'side') {
        return { x: pos.x * width, y: trussY + (floorY - trussY) * (pos.y ?? 0.5) }
      }
      return { x: pos.x * width, y: pos.level === 'truss' ? trussY + Math.max(5, h * 0.02) : floorY }
    },
    []
  )

  const hitTestFixture = useCallback(
    (mx: number, my: number, width: number, h: number): string | null => {
      for (const [patchId, pos] of positionsRef.current) {
        const { x, y } = fixtureScreenPos(pos, width, h)
        if (Math.abs(mx - x) < 18 && Math.abs(my - y) < 20) return patchId
      }
      return null
    },
    [fixtureScreenPos]
  )

  const hitTestProp = useCallback(
    (mx: number, my: number, width: number, h: number): string | null => {
      const trussY = TRUSS_Y * h
      const floorY = FLOOR_Y * h
      for (const prop of currentProps()) {
        const px = prop.x * width
        if (prop.type === 'vtruss') {
          if (Math.abs(mx - px) < 14 && my > trussY && my < floorY) return prop.id
        } else if (Math.abs(mx - px) < width * 0.06 && my > floorY - h * 0.2 && my < floorY + 6) {
          return prop.id
        }
      }
      return null
    },
    [currentProps]
  )

  function trashCenter(width: number, h: number): { x: number; y: number; r: number } {
    return { x: width - 34, y: h - 30, r: 22 }
  }

  function pointer(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (!editable) return
    const { x, y } = pointer(e)
    const canvas = e.currentTarget
    const fixtureHit = hitTestFixture(x, y, canvas.clientWidth, canvas.clientHeight)
    const propHit = fixtureHit ? null : hitTestProp(x, y, canvas.clientWidth, canvas.clientHeight)
    const target: DragTarget | null = fixtureHit
      ? { type: 'fixture', id: fixtureHit }
      : propHit
        ? { type: 'prop', id: propHit }
        : null
    if (target) {
      dragRef.current = { target, moved: false, px: x, py: y }
      canvas.setPointerCapture(e.pointerId)
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    const canvas = e.currentTarget
    const { x, y } = pointer(e)
    const width = canvas.clientWidth
    const h = canvas.clientHeight

    const drag = dragRef.current
    if (drag) {
      drag.moved = true
      drag.px = x
      drag.py = y
      const nx = Math.min(0.97, Math.max(0.03, x / width))
      if (drag.target.type === 'fixture') {
        // Snap: near a vertical truss column → side mount; otherwise top/floor.
        const trussY = TRUSS_Y * h
        const floorY = FLOOR_Y * h
        const vtruss = currentProps().find(
          (p) => p.type === 'vtruss' && Math.abs(x - p.x * width) < 22 && y > trussY + 10 && y < floorY - 6
        )
        if (vtruss) {
          const ny = Math.min(0.95, Math.max(0.05, (y - trussY) / (floorY - trussY)))
          positionsRef.current.set(drag.target.id, { x: vtruss.x, level: 'side', y: ny })
        } else {
          positionsRef.current.set(drag.target.id, {
            x: nx,
            level: y < h * 0.5 ? 'truss' : 'floor'
          })
        }
      } else {
        propDragXRef.current.set(drag.target.id, nx)
      }
      canvas.style.cursor = 'grabbing'
      return
    }
    if (editable) {
      const hit = hitTestFixture(x, y, width, h) ?? hitTestProp(x, y, width, h)
      canvas.style.cursor = hit ? 'grab' : 'default'
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>): void {
    const drag = dragRef.current
    dragRef.current = null
    const canvas = e.currentTarget
    const { x, y } = pointer(e)

    if (drag && drag.moved) {
      const trash = trashCenter(canvas.clientWidth, canvas.clientHeight)
      const inTrash = Math.hypot(x - trash.x, y - trash.y) < trash.r + 12

      if (drag.target.type === 'fixture') {
        const id = drag.target.id
        if (inTrash) {
          positionsRef.current.delete(id)
          updateProject((p) => ({ ...p, patches: p.patches.filter((patch) => patch.id !== id) }))
        } else {
          const pos = positionsRef.current.get(id)
          if (pos) {
            updateProject((p) => ({
              ...p,
              patches: p.patches.map((patch) => (patch.id === id ? { ...patch, stage: { ...pos } } : patch))
            }))
          }
        }
      } else {
        const id = drag.target.id
        const nx = propDragXRef.current.get(id)
        propDragXRef.current.delete(id)
        if (inTrash) {
          updateProject((p) => ({ ...p, stageProps: p.stageProps.filter((prop) => prop.id !== id) }))
        } else if (nx !== undefined) {
          updateProject((p) => ({
            ...p,
            stageProps: p.stageProps.map((prop) => (prop.id === id ? { ...prop, x: nx } : prop))
          }))
        }
      }
      return
    }
    if (!drag && onBackgroundClick) {
      const hit = hitTestFixture(x, y, canvas.clientWidth, canvas.clientHeight)
      if (!hit) onBackgroundClick()
    }
  }

  function addProp(type: StagePropType): void {
    updateProject((p) => ({
      ...p,
      stageProps: [...p.stageProps, { id: `prop-${Date.now()}`, type, x: type === 'vtruss' ? 0.15 : 0.3 }]
    }))
    setPickerOpen(false)
  }

  return (
    <div className={`stage-wrap ${className ?? ''}`} style={{ height }}>
      <canvas
        ref={canvasRef}
        style={{ height: '100%', width: '100%', display: 'block', borderRadius: 12 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      {editable && (
        <>
          <button className="stage-add-button" title="Add stage pieces" onClick={() => setPickerOpen((v) => !v)}>
            +
          </button>
          {pickerOpen && (
            <div className="stage-picker">
              <div className="stage-picker-title">Add to stage</div>
              {PROP_CHOICES.map((choice) => (
                <button key={choice.type} className="stage-picker-item" onClick={() => addProp(choice.type)}>
                  <span className="stage-picker-label">{choice.label}</span>
                  <span className="stage-picker-hint">{choice.hint}</span>
                </button>
              ))}
              <div className="stage-picker-hint" style={{ padding: '6px 4px 0' }}>
                Lights are added in the Fixtures section below.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Canvas rendering
// ---------------------------------------------------------------------------

interface RenderContext {
  fixtures: PatchedFixture[]
  snapshot: Record<number, number[]>
  positions: Map<string, StagePosition>
  props: StageProp[]
  editable: boolean
  dragging: DragState | null
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

  drawHorizontalTruss(ctx, width, trussY, height)
  for (const prop of rc.props) {
    drawProp(ctx, prop, width, height, trussY, floorY)
  }

  // --- fixture states ---
  const states: { state: FixtureVisualState; pos: StagePosition }[] = []
  for (const fixture of rc.fixtures) {
    const data = rc.snapshot[fixture.patch.universe]
    const pos = rc.positions.get(fixture.patch.id)
    if (!pos) continue
    const state = data ? readFixtureVisualState(Uint8Array.from(data), fixture) : emptyState(fixture)
    states.push({ state, pos })
  }

  const screenPos = (pos: StagePosition): { x: number; y: number } => {
    if (pos.level === 'side') {
      return { x: pos.x * width, y: trussY + (floorY - trussY) * (pos.y ?? 0.5) }
    }
    return {
      x: pos.x * width,
      y: pos.level === 'truss' ? trussY + Math.max(5, height * 0.02) : floorY
    }
  }

  // --- light pass (additive) ---
  ctx.globalCompositeOperation = 'lighter'
  states.forEach(({ state, pos }, index) => {
    const { x: fx, y: fy } = screenPos(pos)
    let alpha = state.intensity
    if (state.strobing && alpha > 0) {
      alpha *= Math.floor(rc.timeMs / 42 + index * 2.7) % 2 === 0 ? 1 : 0.06
    }
    if (alpha <= 0.01) return

    if (state.kind === 'laser') {
      drawLaserFan(ctx, fx, fy, pos, state, alpha, rc.timeMs, height, width)
    } else if (state.kind === 'derby') {
      drawDerby(ctx, fx, fy, pos, state, alpha, rc.timeMs, height)
    } else if (state.kind === 'fog') {
      drawFogPuff(ctx, fx, fy, alpha, rc.timeMs, height)
    } else if (state.segments && state.segments.length > 1) {
      drawSegmentBar(ctx, fx, fy, pos, state, alpha, height, floorY)
    } else {
      drawBeam(ctx, fx, fy, pos, state, alpha, width, height, floorY)
    }
  })

  // --- fixture bodies (normal blend, on top of light) ---
  ctx.globalCompositeOperation = 'source-over'
  states.forEach(({ state, pos }) => {
    const { x: fx, y: fy } = screenPos(pos)
    drawFixtureBody(ctx, fx, fy, pos, state, rc.editable, height)
  })

  // --- trash bin while dragging ---
  if (rc.editable && rc.dragging?.moved) {
    drawTrashBin(ctx, width, height, rc.dragging)
  }
}

function drawHorizontalTruss(ctx: CanvasRenderingContext2D, width: number, trussY: number, height: number): void {
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
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  prop: StageProp,
  width: number,
  height: number,
  trussY: number,
  floorY: number
): void {
  const px = prop.x * width
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.fillStyle = '#191920'
  ctx.lineWidth = 1

  switch (prop.type) {
    case 'vtruss': {
      const railGap = Math.max(5, height * 0.018)
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'
      ctx.lineWidth = 1.5
      for (const dx of [-railGap / 2, railGap / 2]) {
        ctx.beginPath()
        ctx.moveTo(px + dx, trussY)
        ctx.lineTo(px + dx, floorY)
        ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      const lattice = Math.max(12, height / 22)
      for (let y = trussY; y < floorY - lattice; y += lattice) {
        ctx.beginPath()
        ctx.moveTo(px - railGap / 2, y)
        ctx.lineTo(px + railGap / 2, y + lattice)
        ctx.moveTo(px + railGap / 2, y)
        ctx.lineTo(px - railGap / 2, y + lattice)
        ctx.stroke()
      }
      // Base plate.
      ctx.fillRect(px - railGap * 1.6, floorY - 3, railGap * 3.2, 3)
      break
    }
    case 'speaker': {
      const w = Math.min(width * 0.07, 70)
      const boxH = height * 0.09
      for (let i = 0; i < 2; i++) {
        const y = floorY - boxH * (i + 1)
        ctx.beginPath()
        ctx.roundRect(px - w / 2, y, w, boxH - 2, 2)
        ctx.fill()
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(px, y + boxH / 2, boxH * 0.28, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'booth': {
      drawBooth(ctx, px, floorY, Math.min(width * 0.16, 150), height)
      break
    }
    case 'riser': {
      const w = Math.min(width * 0.14, 130)
      const h = height * 0.045
      ctx.beginPath()
      ctx.roundRect(px - w / 2, floorY - h, w, h, 2)
      ctx.fill()
      ctx.stroke()
      break
    }
  }
}

function drawTrashBin(ctx: CanvasRenderingContext2D, width: number, height: number, drag: DragState): void {
  const cx = width - 34
  const cy = height - 30
  const r = 22
  const hot = Math.hypot(drag.px - cx, drag.py - cy) < r + 12

  ctx.globalCompositeOperation = 'source-over'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = hot ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.06)'
  ctx.fill()
  ctx.strokeStyle = hot ? '#ef4444' : 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Bin glyph.
  ctx.strokeStyle = hot ? '#fff' : 'rgba(255,255,255,0.6)'
  const s = 7
  ctx.strokeRect(cx - s, cy - s + 3, s * 2, s * 2 - 3)
  ctx.beginPath()
  ctx.moveTo(cx - s - 3, cy - s + 3)
  ctx.lineTo(cx + s + 3, cy - s + 3)
  ctx.moveTo(cx - 3, cy - s + 3)
  ctx.lineTo(cx - 3, cy - s)
  ctx.lineTo(cx + 3, cy - s)
  ctx.lineTo(cx + 3, cy - s + 3)
  ctx.stroke()
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

/** Rest direction of a fixture's beam given its mount. */
function restDirection(pos: StagePosition): number {
  if (pos.level === 'truss') return Math.PI / 2 // down
  if (pos.level === 'floor') return -Math.PI / 2 // up
  return pos.x < 0.5 ? 0 : Math.PI // side: across the stage
}

function beamAngle(state: FixtureVisualState, pos: StagePosition): number {
  if (state.pan !== null) {
    return (state.pan - 0.5) * 1.9 // movers: pan sweeps the beam
  }
  // Static fixtures lean gently toward center stage for a fuller look.
  if (pos.level === 'side') return pos.x < 0.5 ? 0.12 : -0.12
  const lean = (pos.x - 0.5) * -0.35
  return pos.level === 'floor' ? lean : -lean
}

function drawBeam(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  pos: StagePosition,
  state: FixtureVisualState,
  alpha: number,
  width: number,
  height: number,
  floorY: number
): void {
  const down = pos.level === 'truss'
  const side = pos.level === 'side'
  const baseDir = restDirection(pos)
  const flip = pos.level === 'floor' ? -1 : 1
  const angle = baseDir + beamAngle(state, pos) * flip
  const tiltFactor = state.tilt !== null ? 0.65 + state.tilt * 0.7 : 1
  const reach = side ? width * 0.5 : down ? floorY - fy : fy
  const length = reach * 0.95 * tiltFactor
  const halfWidthFar = length * 0.3

  const tipX = fx + Math.cos(angle) * length
  const tipY = fy + Math.sin(angle) * length
  const perpX = -Math.sin(angle)
  const perpY = Math.cos(angle)

  const color = (a: number): string =>
    `rgba(${Math.round(state.r * 255)},${Math.round(state.g * 255)},${Math.round(state.b * 255)},${a})`

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

  const glowR = Math.max(6, height * 0.045) * (0.6 + alpha * 0.7)
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, glowR)
  glow.addColorStop(0, color(alpha * 0.9))
  glow.addColorStop(1, color(0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(fx, fy, glowR, 0, Math.PI * 2)
  ctx.fill()

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
  } else if (!side) {
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

function drawSegmentBar(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  pos: StagePosition,
  state: FixtureVisualState,
  alpha: number,
  height: number,
  floorY: number
): void {
  const segs = state.segments!
  const total = barWidth(segs.length, height)
  const cellSpan = total / segs.length
  const side = pos.level === 'side'
  const down = pos.level === 'truss'
  const baseDir = restDirection(pos)
  const movingBar = state.kind === 'movingBar'

  segs.forEach((seg, i) => {
    const segAlpha =
      alpha <= 0
        ? 0
        : Math.max(0, Math.min(1, seg.intensity)) *
          (state.strobing ? alpha / Math.max(state.intensity, 0.01) : 1)
    if (segAlpha <= 0.02) return
    // Cells run horizontally on truss/floor mounts, vertically up a side truss.
    const cx = side ? fx : fx - total / 2 + cellSpan * (i + 0.5)
    const cy = side ? fy - total / 2 + cellSpan * (i + 0.5) : fy
    const tiltAngle = movingBar && seg.tilt !== null ? (seg.tilt - 0.5) * 1.6 : 0
    const angle = baseDir + tiltAngle
    const length = (side ? height * 0.5 : down ? floorY - fy : fy) * 0.9
    const tipX = cx + Math.cos(angle) * length
    const tipY = cy + Math.sin(angle) * length
    const perpX = -Math.sin(angle)
    const perpY = Math.cos(angle)
    const hw = Math.max(cellSpan * 0.5, length * 0.06)

    const color = (a: number): string =>
      `rgba(${Math.round(seg.r * 255)},${Math.round(seg.g * 255)},${Math.round(seg.b * 255)},${a})`
    const grad = ctx.createLinearGradient(cx, cy, tipX, tipY)
    grad.addColorStop(0, color(segAlpha * 0.35))
    grad.addColorStop(1, color(segAlpha * 0.03))
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(tipX + perpX * hw, tipY + perpY * hw)
    ctx.lineTo(tipX - perpX * hw, tipY - perpY * hw)
    ctx.closePath()
    ctx.fill()

    const glowR = Math.max(3, cellSpan * 0.55)
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
    glow.addColorStop(0, color(segAlpha * 0.95))
    glow.addColorStop(1, color(0))
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
    ctx.fill()
  })
}

function drawDerby(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  pos: StagePosition,
  state: FixtureVisualState,
  alpha: number,
  timeMs: number,
  height: number
): void {
  const baseDir = restDirection(pos)
  const spin = (timeMs / 900) % (Math.PI * 2)
  const beams = 6
  const length = height * 0.55
  const color = (a: number): string =>
    `rgba(${Math.round(state.r * 255)},${Math.round(state.g * 255)},${Math.round(state.b * 255)},${a})`

  for (let i = 0; i < beams; i++) {
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
  pos: StagePosition,
  state: FixtureVisualState,
  alpha: number,
  timeMs: number,
  height: number,
  width: number
): void {
  const baseDir = restDirection(pos)
  const rays = 7
  const fan = 0.9
  const wobble = Math.sin(timeMs / 700) * 0.18
  const length = pos.level === 'side' ? width * 0.6 : height * (pos.level === 'truss' ? 0.75 : 0.85)
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
  pos: StagePosition,
  state: FixtureVisualState,
  editable: boolean,
  height: number
): void {
  const level = pos.level
  const s = Math.max(5, height * 0.028)
  ctx.fillStyle = '#26262e'
  ctx.strokeStyle = editable ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1

  if (state.kind === 'movingHead') {
    const lean = state.pan !== null ? (state.pan - 0.5) * 0.9 : 0
    ctx.save()
    ctx.translate(fx, fy)
    if (level === 'side') ctx.rotate(pos.x < 0.5 ? -Math.PI / 2 : Math.PI / 2)
    ctx.rotate(level === 'truss' ? lean : -lean)
    ctx.fillRect(-s * 0.35, level === 'floor' ? -s * 1.1 : 0, s * 0.7, s * 1.1)
    ctx.beginPath()
    ctx.ellipse(0, level === 'floor' ? -s * 1.35 : s * 1.35, s * 0.8, s * 1.05, 0, 0, Math.PI * 2)
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
    const total = barWidth(state.segments.length, height)
    const cellSpan = total / state.segments.length
    const vertical = level === 'side'
    ctx.beginPath()
    if (vertical) ctx.roundRect(fx - s * 0.45, fy - total / 2, s * 0.9, total, 2)
    else ctx.roundRect(fx - total / 2, fy - s * 0.45, total, s * 0.9, 2)
    ctx.fill()
    ctx.stroke()
    state.segments.forEach((_, i) => {
      const cx = vertical ? fx : fx - total / 2 + cellSpan * (i + 0.5)
      const cy = vertical ? fy - total / 2 + cellSpan * (i + 0.5) : fy
      ctx.beginPath()
      ctx.arc(cx, cy, Math.min(cellSpan * 0.3, s * 0.32), 0, Math.PI * 2)
      ctx.stroke()
    })
  } else if (state.kind === 'derby') {
    ctx.beginPath()
    ctx.arc(fx, fy, s * 0.9, level === 'truss' ? 0 : Math.PI, level === 'truss' ? Math.PI : Math.PI * 2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else if (state.kind === 'scanner') {
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
    ctx.save()
    ctx.translate(fx, fy)
    if (level === 'truss') ctx.rotate(Math.PI)
    else if (level === 'side') ctx.rotate(pos.x < 0.5 ? Math.PI / 2 : -Math.PI / 2)
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
  const x = cx - boothWidth / 2
  const y = floorY - boothH
  ctx.beginPath()
  ctx.roundRect(x, y, boothWidth, boothH, 3)
  ctx.fill()
  ctx.stroke()
  const lw = boothWidth * 0.22
  ctx.fillStyle = '#22222b'
  ctx.beginPath()
  ctx.roundRect(cx - lw / 2, y - boothH * 0.42, lw, boothH * 0.42, 2)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  for (const dx of [-boothWidth * 0.3, boothWidth * 0.3]) {
    ctx.beginPath()
    ctx.arc(cx + dx, y + boothH * 0.45, boothH * 0.28, 0, Math.PI * 2)
    ctx.stroke()
  }
}
