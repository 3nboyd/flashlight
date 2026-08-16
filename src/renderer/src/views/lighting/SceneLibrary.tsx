import { useEffect, useMemo, type CSSProperties, type JSX } from 'react'
import type { Scene } from '@core/lighting/engine/types'
import { PRESET_SCENES } from '@core/lighting/engine/presetScenes'
import { fixturesById } from '@core/lighting/fixtures/library'
import { useLightingStore } from '../../state/lightingStore'
import { ScenePreviewLayer } from './SceneTile'
import { groupScenesByCategory } from './sceneCategories'
import { describeScene } from './sceneDescribe'
import { rigProfile, sceneCompatible } from './sceneCompat'

/**
 * The unified scene + preset library (merges the old Presets drawer and Scenes
 * browser). A side drawer of animated tiles: each rounded square shows the
 * scene's live preview (mostly color/motion) with a solid dark bar at the
 * bottom holding Play/Stop and + Pad, so the effect is visible and the actions
 * stay readable. Preset scenes not yet on this stage show NEW and are added the
 * first time you Play or Pad them.
 */
export function SceneLibrary({ onClose }: { onClose: () => void }): JSX.Element {
  const { project, updateProject, triggerScene, status } = useLightingStore()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const projIds = useMemo(() => new Set(project.scenes.map((s) => s.id)), [project.scenes])
  const trashed = useMemo(
    () => new Set((project.trashScenes ?? []).map((t) => t.id)),
    [project.trashScenes]
  )
  const missing = useMemo(
    () => PRESET_SCENES.filter((s) => !projIds.has(s.id) && !trashed.has(s.id)),
    [projIds, trashed]
  )
  const rig = useMemo(
    () => rigProfile(project.patches, fixturesById(project.customFixtures)),
    [project.patches, project.customFixtures]
  )
  const all = useMemo(() => [...project.scenes, ...missing], [project.scenes, missing])
  const compatible = all.filter((s) => sceneCompatible(s, rig))
  const incompatible = all.filter((s) => !sceneCompatible(s, rig))
  const groups = groupScenesByCategory(compatible)

  const inProject = (s: Scene): boolean => projIds.has(s.id)
  const onPad = (s: Scene): boolean => project.padSceneIds.includes(s.id)

  async function ensure(s: Scene): Promise<void> {
    if (!inProject(s)) {
      await updateProject((p) => ({ ...p, scenes: [...p.scenes, structuredClone(s)] }))
    }
  }
  async function play(s: Scene): Promise<void> {
    await ensure(s)
    const active = useLightingStore.getState().status?.activeSceneId === s.id
    await triggerScene(active ? null : s.id)
  }
  async function addPad(s: Scene): Promise<void> {
    await ensure(s)
    await updateProject((p) => {
      if (p.padSceneIds.includes(s.id)) return p
      const free = p.padSceneIds.findIndex((id) => id === null)
      if (free === -1) return p
      const padSceneIds = [...p.padSceneIds]
      padSceneIds[free] = s.id
      return { ...p, padSceneIds }
    })
  }
  async function addAllMissing(): Promise<void> {
    if (missing.length === 0) return
    await updateProject((p) => ({
      ...p,
      scenes: [...p.scenes, ...missing.map((s) => structuredClone(s))]
    }))
  }

  const tile = (scene: Scene, dim = false): JSX.Element => {
    const active = status?.activeSceneId === scene.id
    return (
      <div
        key={scene.id}
        className={`lib-tile${active ? ' active' : ''}${dim ? ' dim' : ''}`}
        style={{ '--tile': scene.uiColor } as CSSProperties}
        title={describeScene(scene)}
      >
        <ScenePreviewLayer scene={scene} />
        <div className="lib-tile-top">
          <span className="lib-tile-name">{scene.name}</span>
          <span className="lib-tile-tags">
            {scene.momentary && <span className="lib-tag hold">HOLD</span>}
            {!inProject(scene) && <span className="lib-tag new">NEW</span>}
          </span>
        </div>
        <div className="lib-tile-bar">
          <button className="lib-tile-btn play" onClick={() => play(scene)}>
            {active ? '■ Stop' : '▶ Play'}
          </button>
          <button
            className="lib-tile-btn pad"
            disabled={onPad(scene)}
            onClick={() => addPad(scene)}
          >
            {onPad(scene) ? 'On pad ✓' : '+ Pad'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="preset-drawer-backdrop" onClick={onClose}>
      <aside className="preset-drawer scene-library" onClick={(e) => e.stopPropagation()}>
        <div className="preset-drawer-header">
          <h2>Scenes</h2>
          <button className="secondary-button" onClick={onClose}>
            Close (Esc)
          </button>
        </div>
        <p className="settings-hint">
          Play switches the live look; + Pad pins it to the next free pad. NEW presets are added to
          this stage the first time you use them.
        </p>
        {missing.length > 0 && (
          <div className="preset-sync-row">
            <button className="secondary-button" onClick={addAllMissing}>
              + Add {missing.length} new preset{missing.length === 1 ? '' : 's'} to this stage
            </button>
          </div>
        )}
        <div className="preset-drawer-scroll">
          {groups.map((g) => (
            <section key={g.key} className="lib-category">
              <h3>{g.label}</h3>
              <div className="lib-grid">{g.scenes.map((s) => tile(s))}</div>
            </section>
          ))}
          {incompatible.length > 0 && (
            <section className="lib-category">
              <h3>Not compatible with your rig</h3>
              <div className="lib-grid">{incompatible.map((s) => tile(s, true))}</div>
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}
