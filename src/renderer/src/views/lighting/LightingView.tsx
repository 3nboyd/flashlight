import { useEffect, useState, type JSX } from 'react'
import { useLightingStore } from '../../state/lightingStore'
import { Banner } from '../../components/Banner'
import { PerformPanel } from './PerformPanel'
import { SetupPanel } from './SetupPanel'
import { PresetBrowser } from './PresetBrowser'
import { autoStartAudioIfConfigured } from './runtime'
import './lighting.css'

interface LightingViewProps {
  /** Perform/Setup selection lives in the app sidebar. */
  mode: 'perform' | 'setup'
}

export function LightingView({ mode }: LightingViewProps): JSX.Element {
  const { load, loaded, status, startEngine, stopEngine, project } = useLightingStore()
  const [presetsOpen, setPresetsOpen] = useState(false)

  useEffect(() => {
    if (!loaded) load()
  }, [load, loaded])

  useEffect(() => {
    if (loaded) autoStartAudioIfConfigured(project.audio)
  }, [loaded, project.audio])

  if (!loaded) {
    return <div className="view" />
  }

  const running = status?.running ?? false

  return (
    <div className="view lighting-view">
      <header className="view-header lighting-header">
        <div>
          <h1>{mode === 'perform' ? 'Perform' : 'Setup'}</h1>
          <p className="view-subtitle">
            {mode === 'perform'
              ? 'Pads, live overrides, and the automatic show — synced to your decks.'
              : 'Rig, stages, presets, connections, and automation.'}
          </p>
        </div>
        <div className="lighting-header-controls">
          <button className="secondary-button" onClick={() => setPresetsOpen(true)}>
            Presets
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
      {running && project.patches.length === 0 && (
        <Banner kind="info">Output is running but no fixtures are patched — add them in Setup.</Banner>
      )}

      {mode === 'perform' ? <PerformPanel /> : <SetupPanel />}

      {presetsOpen && <PresetBrowser onClose={() => setPresetsOpen(false)} showStage={mode === 'setup'} />}
    </div>
  )
}
