import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'

/**
 * The projector / stage-TV output window: a second BrowserWindow that renders
 * the camera visuals full-screen. It reuses the same renderer bundle in an
 * "output" mode (loaded at the #output route) so it shares detection + effect
 * code with the main window and stays in sync via localStorage.
 */

// Several projector/TV outputs can be open at once (one per screen). They all
// render the same #output surface, synced through localStorage + the lighting
// clock, so the operator can throw the visual onto multiple displays.
const outputWindows = new Set<BrowserWindow>()
const MAX_OUTPUTS = 6

function liveCount(): number {
  for (const w of outputWindows) if (w.isDestroyed()) outputWindows.delete(w)
  return outputWindows.size
}

function createOutputWindow(): BrowserWindow {
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const externals = displays.filter((d) => d.id !== primary.id)
  // Put the Nth output on the Nth external display when possible; otherwise
  // cascade framed windows on the primary so they don't stack exactly.
  const index = outputWindows.size
  const external = externals[index] ?? externals[0]
  const target = external ?? primary
  const cascade = external ? 0 : index * 36

  const win = new BrowserWindow({
    x: target.bounds.x + 40 + cascade,
    y: target.bounds.y + 40 + cascade,
    width: 960,
    height: 540,
    backgroundColor: '#000000',
    title: `DJ Companion Output ${index + 1}`,
    // On a real second display (projector) go borderless full-screen; with only
    // one screen, use a normal framed window so the operator can move/close it.
    fullscreen: Boolean(external),
    frame: !external,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  win.on('closed', () => outputWindows.delete(win))

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#output`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'output' })
  }
  return win
}

export function registerOutputHandlers(): void {
  // Each call opens ANOTHER output window (up to MAX_OUTPUTS), so multiple
  // screens can be driven at once. Returns the number now open.
  ipcMain.handle('output:open', () => {
    if (liveCount() < MAX_OUTPUTS) outputWindows.add(createOutputWindow())
    return liveCount()
  })

  // Close them all (the UI offers a single "close all").
  ipcMain.handle('output:close', () => {
    for (const w of outputWindows) if (!w.isDestroyed()) w.close()
    outputWindows.clear()
    return 0
  })

  ipcMain.handle('output:isOpen', () => liveCount() > 0)
  ipcMain.handle('output:count', () => liveCount())
}

export function disposeOutput(): void {
  for (const w of outputWindows) if (!w.isDestroyed()) w.close()
  outputWindows.clear()
}
