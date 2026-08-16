import { useEffect, useState, type JSX } from 'react'
import { Sidebar, type NavState } from './components/Sidebar'
import { SettingsView } from './views/SettingsView'
import { LibraryView } from './views/LibraryView'
import { FileExplorerView } from './views/FileExplorerView'
import { RenameView } from './views/RenameView'
import { BackupsView } from './views/BackupsView'
import { LightingView } from './views/lighting/LightingView'
import { OperatorView } from './views/operator/OperatorView'
import { useSettingsStore } from './state/settingsStore'
import './styles/views.css'

function MusicRouter({ view }: { view: NavState['musicView'] }): JSX.Element {
  switch (view) {
    case 'library':
      return <LibraryView />
    case 'explorer':
      return <FileExplorerView />
    case 'rename':
      return <RenameView />
    case 'backups':
      return <BackupsView />
  }
}

function App(): JSX.Element {
  const [nav, setNav] = useState<NavState>({
    section: 'live',
    musicView: 'library',
    lightingSection: null
  })
  const { load, loaded } = useSettingsStore()

  useEffect(() => {
    load()
  }, [load])

  if (!loaded) {
    return <div className="app-shell" />
  }

  const appearance = nav.section === 'settings' && nav.lightingSection === 'appearance'

  return (
    <div className="app-shell">
      <Sidebar nav={nav} onChange={setNav} />
      {nav.section === 'music' && <MusicRouter view={nav.musicView} />}
      {nav.section === 'live' && <OperatorView />}
      {nav.section === 'setup' && <LightingView mode="setup" scrollSection={nav.lightingSection} />}
      {nav.section === 'settings' && !appearance && (
        <LightingView mode="settings" scrollSection={nav.lightingSection} />
      )}
      {appearance && <SettingsView />}
    </div>
  )
}

export default App
