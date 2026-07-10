import { type JSX } from 'react'
import { PRESET_LIBRARY } from '@core/lighting/engine/presetScenes'
import type { Scene } from '@core/lighting/engine/types'
import { useLightingStore } from '../../state/lightingStore'

/**
 * Side drawer for browsing the built-in preset collection: play any preset
 * instantly (it's added to your scenes on first use) or pin it to the next
 * free performance pad. Kind-aware presets (fog, lasers, strobes…) work on
 * whatever rig is patched.
 */

interface PresetBrowserProps {
  onClose: () => void
}

export function PresetBrowser({ onClose }: PresetBrowserProps): JSX.Element {
  const { project, updateProject, triggerScene, status } = useLightingStore()

  const inProject = (scene: Scene): boolean => project.scenes.some((s) => s.id === scene.id)
  const onPad = (scene: Scene): boolean => project.padSceneIds.includes(scene.id)

  async function ensureInProject(scene: Scene): Promise<void> {
    if (!inProject(scene)) {
      await updateProject((p) => ({ ...p, scenes: [...p.scenes, structuredClone(scene)] }))
    }
  }

  async function play(scene: Scene): Promise<void> {
    await ensureInProject(scene)
    const active = useLightingStore.getState().status?.activeSceneId === scene.id
    await triggerScene(active ? null : scene.id)
  }

  async function addToPad(scene: Scene): Promise<void> {
    await ensureInProject(scene)
    await updateProject((p) => {
      if (p.padSceneIds.includes(scene.id)) return p
      const free = p.padSceneIds.findIndex((id) => id === null)
      if (free === -1) return p
      const padSceneIds = [...p.padSceneIds]
      padSceneIds[free] = scene.id
      return { ...p, padSceneIds }
    })
  }

  return (
    <div className="preset-drawer-backdrop" onClick={onClose}>
      <aside className="preset-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="preset-drawer-header">
          <h2>Preset Library</h2>
          <button className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="settings-hint">
          Hit Play to hear-see a preset live. Presets marked HOLD fire while pressed. Kind-aware
          presets find your fog machines, lasers, strobes, and movers automatically.
        </p>

        <div className="preset-drawer-scroll">
          {PRESET_LIBRARY.map((category) => (
            <section key={category.name} className="preset-category">
              <h3>{category.name}</h3>
              <p className="settings-hint" style={{ marginBottom: 8 }}>
                {category.description}
              </p>
              <div className="preset-grid">
                {category.scenes.map((scene) => {
                  const active = status?.activeSceneId === scene.id
                  return (
                    <div
                      key={scene.id}
                      className={`preset-card${active ? ' active' : ''}`}
                      style={{ '--pad-color': scene.uiColor } as React.CSSProperties}
                    >
                      <div className="preset-card-name">
                        {scene.name}
                        {scene.momentary && <span className="hold-tag">HOLD</span>}
                      </div>
                      <div className="preset-card-actions">
                        <button className="text-button" onClick={() => play(scene)}>
                          {active ? 'Stop' : 'Play'}
                        </button>
                        <button
                          className="text-button"
                          disabled={onPad(scene)}
                          onClick={() => addToPad(scene)}
                        >
                          {onPad(scene) ? 'On pad ✓' : '+ Pad'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </div>
  )
}
