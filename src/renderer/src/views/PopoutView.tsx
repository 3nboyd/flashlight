import { useEffect, useState, type JSX } from 'react'
import { useLightingStore } from '../state/lightingStore'
import { Banner } from '../components/Banner'
import { PerformPanel } from './lighting/PerformPanel'
import { SceneLibrary } from './lighting/SceneLibrary'
import { CameraView } from './camera/CameraView'
import './operator/OperatorView.css'
import './PopoutView.css'

/**
 * A detached Live pane in its own window (loaded at #popout-camera /
 * #popout-lighting), so the operator can drag it to a second monitor. Each pane
 * runs in exactly one window at a time: the main cockpit collapses the pane
 * while it is popped out, so the camera capture and MIDI never run twice.
 *
 * The lighting pop-out deliberately does NOT start audio listening - the main
 * window keeps ownership of the single audio analyzer and keeps streaming
 * features to the engine; this window just drives pads/scenes over IPC.
 */

function LightingPopout(): JSX.Element {
  const { load, loaded, status, startEngine, stopEngine } = useLightingStore()
  const [libraryOpen, setLibraryOpen] = useState(false)

  useEffect(() => {
    if (!loaded) load()
  }, [load, loaded])

  if (!loaded) return <div className="popout-view" />

  const running = status?.running ?? false
  return (
    <div className="popout-view">
      <header className="operator-pane-head popout-head">
        <span className="operator-pane-title">Lighting</span>
        <div className="operator-pane-actions">
          <button
            className="secondary-button"
            title="Scene + preset library"
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
        </div>
      </header>
      {status?.outputError && <Banner kind="error">DMX output error: {status.outputError}</Banner>}
      <div className="popout-body">
        <PerformPanel />
      </div>
      {libraryOpen && <SceneLibrary onClose={() => setLibraryOpen(false)} />}
    </div>
  )
}

function CameraPopout(): JSX.Element {
  return (
    <div className="popout-view popout-view--camera">
      <CameraView />
    </div>
  )
}

export function PopoutView({ kind }: { kind: 'camera' | 'lighting' }): JSX.Element {
  return kind === 'camera' ? <CameraPopout /> : <LightingPopout />
}
