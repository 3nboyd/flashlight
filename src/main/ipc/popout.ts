import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'

/**
 * Pop-out windows for the Live cockpit: the operator can detach the Lighting or
 * the Camera pane into its own framed window and drag it onto a second monitor.
 * Each pane loads the same renderer bundle at a #popout-<name> route. The main
 * window collapses the popped-out pane (so the camera/MIDI only ever run in one
 * window at a time); it learns open/close state from the 'popout:changed'
 * broadcast below.
 */

const windows = new Map<string, BrowserWindow>()
const ALLOWED = new Set(['camera', 'lighting'])

/** Tell every window which pane popped out or back, so mains can collapse it. */
function broadcast(name: string, open: boolean): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('popout:changed', { name, open })
  }
}

function createPopout(name: string): BrowserWindow {
  const primary = screen.getPrimaryDisplay()
  const external = screen.getAllDisplays().find((d) => d.id !== primary.id)
  const target = external ?? primary

  const win = new BrowserWindow({
    x: target.bounds.x + 60,
    y: target.bounds.y + 60,
    width: name === 'camera' ? 1120 : 900,
    height: name === 'camera' ? 720 : 780,
    backgroundColor: '#0a0d14',
    title: name === 'camera' ? 'Flashlight - Camera' : 'Flashlight - Lighting',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  win.on('closed', () => {
    if (windows.get(name) === win) {
      windows.delete(name)
      broadcast(name, false)
    }
  })

  const hash = `popout-${name}`
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
  return win
}

export function registerPopoutHandlers(): void {
  ipcMain.handle('popout:open', (_e, name: string) => {
    if (!ALLOWED.has(name)) return false
    const existing = windows.get(name)
    if (!existing || existing.isDestroyed()) {
      windows.set(name, createPopout(name))
      broadcast(name, true)
    } else {
      existing.focus()
    }
    return true
  })

  ipcMain.handle('popout:close', (_e, name: string) => {
    const win = windows.get(name)
    if (win && !win.isDestroyed()) win.close()
    windows.delete(name)
    return true
  })

  ipcMain.handle('popout:isOpen', (_e, name: string) => {
    const win = windows.get(name)
    return win != null && !win.isDestroyed()
  })
}

export function disposePopouts(): void {
  for (const win of windows.values()) if (!win.isDestroyed()) win.close()
  windows.clear()
}
