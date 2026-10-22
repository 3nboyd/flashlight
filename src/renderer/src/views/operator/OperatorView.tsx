import { useEffect, useState, type JSX } from 'react'
import { useLightingStore } from '../../state/lightingStore'
import { Banner } from '../../components/Banner'
import { PerformPanel } from '../lighting/PerformPanel'
import { SceneLibrary } from '../lighting/SceneLibrary'
import { autoStartAudioIfConfigured, midiPads } from '../lighting/runtime'
import { CameraView } from '../camera/CameraView'
import './OperatorView.css'

type Collapsed = 'none' | 'lighting' | 'camera'
type PoppedOut = { camera: boolean; lighting: boolean }

/**
 * The "Live" cockpit - the app's main screen. Lighting perform + camera program
 * side by side, each in a collapsible pane so the DJ can run both, just
 * lighting, or just camera. Each pane can also pop out into its own window (drag
 * it to a second monitor); while popped out the pane is hidden here so the
 * camera capture / MIDI only ever run in one window. Output start/stop and
 * Presets live in the lighting pane header; per-section overflow settings live
 * behind gear icons in each pane. Owns the single live load of the lighting
 * project (Live may be the first and only section the user opens).
 */
export function OperatorView(): JSX.Element {
  const { load, loaded, status, startEngine, stopEngine, project } = useLightingStore()
  const [collapsed, setCollapsed] = useState<Collapsed>('none')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [poppedOut, setPoppedOut] = useState<PoppedOut>({ camera: false, lighting: false })

  useEffect(() => {
    if (!loaded) load()
  }, [load, loaded])
  useEffect(() => {
    if (loaded) autoStartAudioIfConfigured(project.audio)
  }, [loaded, project.audio])

  // Track which panes are detached into their own windows (from any window).
  useEffect(() => {
    let mounted = true
    const sync = (name: 'camera' | 'lighting'): void => {
      window.djCompanion.popout.isOpen(name).then((open) => {
        if (mounted) setPoppedOut((p) => ({ ...p, [name]: open }))
      })
    }
    sync('camera')
    sync('lighting')
    const off = window.djCompanion.popout.onChanged((name, open) => {
      if (name === 'camera' || name === 'lighting') setPoppedOut((p) => ({ ...p, [name]: open }))
    })
    return () => {
      mounted = false
      off()
    }
  }, [])

  // While Lighting is popped out, this window yields MIDI pad control to the
  // pop-out. When it returns, PerformPanel remounts and re-registers handlers.
  useEffect(() => {
    if (poppedOut.lighting) midiPads.suspendActions()
  }, [poppedOut.lighting])

  if (!loaded) return <div className="operator-view" />

  const running = status?.running ?? false
  const showLighting = collapsed !== 'lighting' && !poppedOut.lighting
  const showCamera = collapsed !== 'camera' && !poppedOut.camera
  const popOut = (name: 'camera' | 'lighting'): void => {
    setPoppedOut((p) => ({ ...p, [name]: true }))
    void window.djCompanion.popout.open(name)
  }
  const bringBack = (name: 'camera' | 'lighting'): void => {
    void window.djCompanion.popout.close(name)
  }

  return (
    <div className={`operator-view collapsed-${collapsed}`}>
      {showLighting ? (
        <section className="operator-pane operator-pane--lighting">
          <header className="operator-pane-head">
            <span className="operator-pane-title">Lighting</span>
            <div className="operator-pane-actions">
              <button
                className="secondary-button"
                title="Scene + preset library: play any look, pin it to a pad, add presets to this stage"
                onClick={() => setLibraryOpen(true)}
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
                className="operator-popout"
                title="Pop lighting out into its own window (for a second monitor)"
                onClick={() => popOut('lighting')}
              >
                ⤢
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
      ) : poppedOut.lighting ? (
        <button
          className="operator-rail operator-rail--lighting operator-rail--popped"
          onClick={() => bringBack('lighting')}
          title="Lighting is open in a pop-out window. Click to bring it back here."
        >
          ⤢ Lighting popped out: bring back
        </button>
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
                className="operator-popout"
                title="Pop the camera out into its own window (for a second monitor)"
                onClick={() => popOut('camera')}
              >
                ⤢
              </button>
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
      ) : poppedOut.camera ? (
        <button
          className="operator-rail operator-rail--camera operator-rail--popped"
          onClick={() => bringBack('camera')}
          title="Camera is open in a pop-out window. Click to bring it back here."
        >
          ⤢ Camera popped out: bring back
        </button>
      ) : (
        <button
          className="operator-rail operator-rail--camera"
          onClick={() => setCollapsed('none')}
          title="Show camera"
        >
          ◀ Camera
        </button>
      )}

      {libraryOpen && <SceneLibrary onClose={() => setLibraryOpen(false)} />}
    </div>
  )
}
