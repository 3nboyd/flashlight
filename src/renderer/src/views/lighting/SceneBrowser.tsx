import { useEffect, useMemo, type JSX } from 'react'
import type { Scene } from '@core/lighting/engine/types'
import { fixturesById } from '@core/lighting/fixtures/library'
import { useLightingStore } from '../../state/lightingStore'
import { SceneTile } from './SceneTile'
import { groupScenesByCategory } from './sceneCategories'
import { describeScene } from './sceneDescribe'
import { rigProfile, sceneCompatible } from './sceneCompat'

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
  const { project } = useLightingStore()
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rig = useMemo(
    () => rigProfile(project.patches, fixturesById(project.customFixtures)),
    [project.patches, project.customFixtures]
  )
  const compatible = scenes.filter((s) => sceneCompatible(s, rig))
  const incompatible = scenes.filter((s) => !sceneCompatible(s, rig))
  const groups = groupScenesByCategory(compatible)

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
                    title={describeScene(scene)}
                    onClick={() => onPick(scene.id)}
                  />
                ))}
              </div>
            </div>
          ))}
          {incompatible.length > 0 && (
            <div className="scene-browser-col">
              <div className="scene-browser-col-title">Not compatible</div>
              <div className="scene-browser-col-tiles incompatible">
                {incompatible.map((scene) => (
                  <SceneTile
                    key={scene.id}
                    scene={scene}
                    selected={scene.id === currentId}
                    title={`${describeScene(scene)} (nothing in your rig matches this)`}
                    onClick={() => onPick(scene.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
