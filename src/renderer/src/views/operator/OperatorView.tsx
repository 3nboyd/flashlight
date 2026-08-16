import { useEffect, useState, type JSX } from 'react'
import { useLightingStore } from '../../state/lightingStore'
import { Banner } from '../../components/Banner'
import { PerformPanel } from '../lighting/PerformPanel'
import { PresetBrowser } from '../lighting/PresetBrowser'
import { SceneBrowser } from '../lighting/SceneBrowser'
import { autoStartAudioIfConfigured } from '../lighting/runtime'
import { CameraView } from '../camera/CameraView'
import './OperatorView.css'

type Collapsed = 'none' | 'lighting' | 'camera'

/**
 * The "Live" cockpit - the app's main screen. Lighting perform + camera program
 * side by side, each in a collapsible pane so the DJ can run both, just
 * lighting, or just camera. Output start/stop and Presets live in the lighting
 * pane header; per-section overflow settings live behind gear icons in each
 * pane. Owns the single live load of the lighting project (Live may be the first
 * and only section the user opens).
 */
export function OperatorView(): JSX.Element {
  const { load, loaded, status, startEngine, stopEngine, project, triggerScene } = useLightingStore()
  const [collapsed, setCollapsed] = useState<Collapsed>('none')
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [browseOpen, setBrowseOpen] = useState(false)

  useEffect(() => {
    if (!loaded) load()
  }, [load, loaded])
  useEffect(() => {
    if (loaded) autoStartAudioIfConfigured(project.audio)
  }, [loaded, project.audio])

  if (!loaded) return <div className="operator-view" />

  const running = status?.running ?? false
  const showLighting = collapsed !== 'lighting'
  const showCamera = collapsed !== 'camera'

  return (
    <div className={`operator-view collapsed-${collapsed}`}>
      {showLighting ? (
        <section className="operator-pane operator-pane--lighting">
          <header className="operator-pane-head">
            <span className="operator-pane-title">Lighting</span>
            <div className="operator-pane-actions">
              <button
                className="secondary-button"
                title="Preset library: import ready-made looks onto your rig"
                onClick={() => setPresetsOpen(true)}
              >
                Presets
              </button>
              <button
                className="secondary-button"
                title="Browse your scenes by category (with previews) and switch the live look"
                onClick={() => setBrowseOpen(true)}
              >
                Scenes
              </button>
              <button
                className={running ? 'danger-button' : 'primary-button'}
                onClick={() => (running ? stopEngine() : startEngine())}
              >
                {running ? '■ Stop Output' : '▶ Start Output'}
              </button>
              <button
                className="operator-collapse"
                title="Collapse lighting (camera only)"
                onClick={() => setCollapsed('lighting')}
              >
                ◀
              </button>
            </div>
          </header>
          {status?.outputError && (
            <Banner kind="error">DMX output error: {status.outputError}</Banner>
          )}
          <div className="operator-pane-body">
            <PerformPanel />
          </div>
        </section>
      ) : (
        <button
          className="operator-rail operator-rail--lighting"
          onClick={() => setCollapsed('none')}
          title="Show lighting"
        >
          ▶ Lighting
        </button>
      )}

      {showCamera ? (
        <section className="operator-pane operator-pane--camera">
          <header className="operator-pane-head">
            <span className="operator-pane-title">Camera / Screen</span>
            <div className="operator-pane-actions">
              <button
                className="operator-collapse"
                title="Collapse camera (lighting only)"
                onClick={() => setCollapsed('camera')}
              >
                ▶
              </button>
            </div>
          </header>
          <div className="operator-pane-body">
            <CameraView embedded />
          </div>
        </section>
      ) : (
        <button
          className="operator-rail operator-rail--camera"
          onClick={() => setCollapsed('none')}
          title="Show camera"
        >
          ◀ Camera
        </button>
      )}

      {presetsOpen && <PresetBrowser onClose={() => setPresetsOpen(false)} showStage={false} />}
      {browseOpen && (
        <SceneBrowser
          scenes={project.scenes}
          title="Switch scene"
          currentId={status?.activeSceneId ?? null}
          onPick={(id) => {
            triggerScene(id)
            setBrowseOpen(false)
          }}
          onClose={() => setBrowseOpen(false)}
        />
      )}
    </div>
  )
}
