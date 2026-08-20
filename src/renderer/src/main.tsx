import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { OutputView } from './views/camera/OutputView'
import { PopoutView } from './views/PopoutView'
import { MonitorView } from './views/MonitorView'
import './styles/theme.css'
import './styles/global.css'

// The same bundle serves a few bare surfaces loaded at a hash route:
//  #output          -> the projector / stage-TV full-screen visual
//  #popout-camera   -> the Live camera pane detached to its own window
//  #popout-lighting -> the Live lighting pane detached to its own window
// Anything else renders the full app.
const route = window.location.hash.replace(/^#/, '')

function Root(): React.JSX.Element {
  if (route === 'output') return <OutputView />
  if (route === 'popout-camera') return <PopoutView kind="camera" />
  if (route === 'popout-lighting') return <PopoutView kind="lighting" />
  if (route === 'monitor') return <MonitorView />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
