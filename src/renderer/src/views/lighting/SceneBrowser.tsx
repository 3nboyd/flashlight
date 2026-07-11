import { useEffect, type JSX } from 'react'
import type { Scene } from '@core/lighting/engine/types'
import { SceneTile } from './SceneTile'
import { groupScenesByCategory } from './sceneCategories'

/**
 * Centered modal that shows every scene as an animated tile, laid out in
 * category columns (Normals / Builds / Flashing / Peaks / Custom) so you can
 * scan and switch without a long scrolling dropdown. Used both to assign a
 * scene to a pad and to switch the live scene from Perform.
 */

interface SceneBrowserProps {
  scenes: Scene[]
  title: string
  /** Scene highlighted as the current pick (pad's scene or the live scene). */
  currentId?: string | null
  onPick: (id: string) => void
  /** Shown as a "Clear pad" action when assigning an already-filled pad. */
  onClear?: () => void
  onClose: () => void
}

export function SceneBrowser({
  scenes,
  title,
  currentId,
  onPick,
  onClear,
  onClose
}: SceneBrowserProps): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const groups = groupScenesByCategory(scenes)

  return (
    <div className="scene-browser-overlay" onClick={onClose}>
      <div className="scene-browser" onClick={(e) => e.stopPropagation()}>
        <div className="scene-browser-head">
          <h3>{title}</h3>
          <div className="scene-browser-head-actions">
            {onClear && (
              <button className="secondary-button" onClick={onClear}>
                Clear pad
              </button>
            )}
            <button className="secondary-button" onClick={onClose}>
              Close (Esc)
            </button>
          </div>
        </div>
        <div className="scene-browser-cols">
          {groups.map((groupItem) => (
            <div key={groupItem.key} className="scene-browser-col">
              <div className="scene-browser-col-title">{groupItem.label}</div>
              <div className="scene-browser-col-tiles">
                {groupItem.scenes.map((scene) => (
                  <SceneTile
                    key={scene.id}
                    scene={scene}
                    selected={scene.id === currentId}
                    title={scene.name}
                    onClick={() => onPick(scene.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
