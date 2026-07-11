import type { CSSProperties, JSX, ReactNode } from 'react'
import type { Scene } from '@core/lighting/engine/types'
import { scenePreview } from './scenePreview'

/**
 * A square scene tile with a live CSS-animated preview of what the scene does
 * (pulse / strobe / cycle / rainbow / move). A half-opaque veil sits over the
 * animation so a wall of tiles stays calm, and lifts on hover so you can see
 * the motion. Reused by the Setup scene grid and the pad/scene browser.
 */

interface SceneTileProps {
  scene: Scene
  /** Ring highlight (e.g. the scene currently on this pad). */
  selected?: boolean
  /** Stronger glow (e.g. the live scene). */
  active?: boolean
  onClick?: () => void
  title?: string
  /** Hover-revealed controls in the top-right corner. */
  actions?: ReactNode
}

export function ScenePreviewLayer({ scene }: { scene: Scene }): JSX.Element {
  const { kind, colors } = scenePreview(scene)
  const style = {
    '--c1': colors[0],
    '--c2': colors[1] ?? colors[0],
    '--c3': colors[2] ?? colors[1] ?? colors[0]
  } as CSSProperties
  return <div className={`tile-fx tile-fx-${kind}`} style={style} aria-hidden />
}

export function SceneTile({
  scene,
  selected,
  active,
  onClick,
  title,
  actions
}: SceneTileProps): JSX.Element {
  return (
    <div
      className={`scene-tile2${selected ? ' selected' : ''}${active ? ' active' : ''}`}
      style={{ '--tile': scene.uiColor } as CSSProperties}
      onClick={onClick}
      title={title}
    >
      <ScenePreviewLayer scene={scene} />
      <div className="tile-veil" aria-hidden />
      <div className="scene-tile2-label">
        {scene.name}
        {scene.momentary && <span className="tile-hold">HOLD</span>}
      </div>
      {actions && (
        <div className="scene-tile2-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  )
}
