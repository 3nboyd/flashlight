import { useEffect, useState, type JSX } from 'react'
import { useLightingStore } from '../../state/lightingStore'
import { Banner } from '../../components/Banner'
import { PerformPanel } from './PerformPanel'
import { SetupPanel } from './SetupPanel'
import './lighting.css'

type Mode = 'perform' | 'setup'

export function LightingView(): JSX.Element {
  const { load, loaded, status, startEngine, stopEngine, project } = useLightingStore()
  const [mode, setMode] = useState<Mode>('perform')

  useEffect(() => {
    if (!loaded) load()
  }, [load, loaded])

  if (!loaded) {
    return <div className="view" />
  }

  const running = status?.running ?? false

  return (
    <div className="view lighting-view">
      <header className="view-header lighting-header">
        <div>
          <h1>Lighting</h1>
          <p className="view-subtitle">
            Beat-synced, audio-reactive DMX over Art-Net/sACN — perform with pads, edit in Setup.
          </p>
        </div>
        <div className="lighting-header-controls">
          <div className="mode-tabs">
            <button className={mode === 'perform' ? 'active' : ''} onClick={() => setMode('perform')}>
              Perform
            </button>
            <button className={mode === 'setup' ? 'active' : ''} onClick={() => setMode('setup')}>
              Setup
            </button>
          </div>
          <button
            className={running ? 'danger-button' : 'primary-button'}
            onClick={() => (running ? stopEngine() : startEngine())}
          >
            {running ? '■ Stop Output' : '▶ Start Output'}
          </button>
        </div>
      </header>

      {status?.outputError && <Banner kind="error">DMX output error: {status.outputError}</Banner>}
      {running && project.patches.length === 0 && (
        <Banner kind="info">Output is running but no fixtures are patched — add them in Setup.</Banner>
      )}

      {mode === 'perform' ? <PerformPanel /> : <SetupPanel />}
    </div>
  )
}
