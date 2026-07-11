import { useEffect, useState, type JSX } from 'react'
import { useLightingStore } from '../../state/lightingStore'
import { Banner } from '../../components/Banner'
import { PerformPanel } from './PerformPanel'
import { SetupPanel } from './SetupPanel'
import { PresetBrowser } from './PresetBrowser'
import { autoStartAudioIfConfigured } from './runtime'
import './lighting.css'

interface LightingViewProps {
  /** Perform / Setup / Settings selection lives in the app sidebar. */
  mode: 'perform' | 'setup' | 'settings'
  /** Section anchor to scroll to (from a sidebar sub-nav click). */
  scrollSection: string | null
}

const TITLES: Record<LightingViewProps['mode'], string> = {
  perform: 'Perform',
  setup: 'Setup',
  settings: 'Settings'
}

export function LightingView({ mode, scrollSection }: LightingViewProps): JSX.Element {
  const { load, loaded, status, startEngine, stopEngine, project } = useLightingStore()
  const [presetsOpen, setPresetsOpen] = useState(false)

  useEffect(() => {
    if (!loaded) load()
  }, [load, loaded])

  useEffect(() => {
    if (loaded) autoStartAudioIfConfigured(project.audio)
  }, [loaded, project.audio])

  // Scroll to the requested section whenever the sidebar picks one.
  useEffect(() => {
    if (!scrollSection) return
    const el = document.getElementById(`setup-sec-${scrollSection}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [scrollSection, mode])

  if (!loaded) {
    return <div className="view" />
  }

  const running = status?.running ?? false

  return (
    <div className="view lighting-view">
      <header className="view-header lighting-header">
        <h1>{TITLES[mode]}</h1>
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
        <Banner kind="info">Output is running but no fixtures are patched. Add them in Setup.</Banner>
      )}

      {mode === 'perform' && <PerformPanel />}
      {mode === 'setup' && <SetupPanel view="setup" />}
      {mode === 'settings' && <SetupPanel view="settings" />}

      {presetsOpen && (
        <PresetBrowser onClose={() => setPresetsOpen(false)} showStage={mode !== 'perform'} />
      )}
    </div>
  )
}
