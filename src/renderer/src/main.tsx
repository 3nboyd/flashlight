import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { OutputView } from './views/camera/OutputView'
import './styles/theme.css'
import './styles/global.css'

// The projector/stage-TV window loads the same bundle at #output and renders a
// bare full-screen visual surface instead of the full app.
const isOutput = window.location.hash.replace(/^#/, '') === 'output'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isOutput ? <OutputView /> : <App />}</React.StrictMode>
)
