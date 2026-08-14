import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'

/**
 * The projector / stage-TV output window: a second BrowserWindow that renders
 * the camera visuals full-screen. It reuses the same renderer bundle in an
 * "output" mode (loaded at the #output route) so it shares detection + effect
 * code with the main window and stays in sync via localStorage.
 */

let outputWindow: BrowserWindow | null = null

function createOutputWindow(): BrowserWindow {
  const primary = screen.getPrimaryDisplay()
  const external = screen.getAllDisplays().find((d) => d.id !== primary.id)
  const target = external ?? primary

  const win = new BrowserWindow({
    x: target.bounds.x + 40,
    y: target.bounds.y + 40,
    width: 960,
    height: 540,
    backgroundColor: '#000000',
    title: 'DJ Companion Output',
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

  win.on('closed', () => {
    if (outputWindow === win) outputWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#output`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'output' })
  }
  return win
}

export function registerOutputHandlers(): void {
  ipcMain.handle('output:open', () => {
    if (!outputWindow || outputWindow.isDestroyed()) {
      outputWindow = createOutputWindow()
    } else {
      outputWindow.focus()
    }
    return true
  })

  ipcMain.handle('output:close', () => {
    if (outputWindow && !outputWindow.isDestroyed()) outputWindow.close()
    outputWindow = null
    return true
  })

  ipcMain.handle('output:isOpen', () => outputWindow != null && !outputWindow.isDestroyed())
}

export function disposeOutput(): void {
  if (outputWindow && !outputWindow.isDestroyed()) outputWindow.close()
  outputWindow = null
}
