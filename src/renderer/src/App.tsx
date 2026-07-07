import { useEffect, useState, type JSX } from 'react'
import { Sidebar, type ViewId } from './components/Sidebar'
import { SettingsView } from './views/SettingsView'
import { LibraryView } from './views/LibraryView'
import { FileExplorerView } from './views/FileExplorerView'
import { RenameView } from './views/RenameView'
import { BackupsView } from './views/BackupsView'
import { useSettingsStore } from './state/settingsStore'
import './styles/views.css'

function ViewRouter({ view }: { view: ViewId }): JSX.Element {
  switch (view) {
    case 'settings':
      return <SettingsView />
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
  const [view, setView] = useState<ViewId>('library')
  const { load, loaded } = useSettingsStore()

  useEffect(() => {
    load()
  }, [load])

  if (!loaded) {
    return <div className="app-shell" />
  }

  return (
    <div className="app-shell">
      <Sidebar active={view} onSelect={setView} />
      <ViewRouter view={view} />
    </div>
  )
}

export default App
