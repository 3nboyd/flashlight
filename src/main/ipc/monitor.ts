import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'

/**
 * A small always-on-top "recording monitor": a floating corner window that
 * shows the live program (final mix) and a REC indicator, so the operator can
 * keep an eye on the recording while working in other apps - like a picture-in
 * -picture. It loads the same renderer bundle at #monitor and floats above other
 * apps and full-screen spaces (macOS).
 */

let monitorWindow: BrowserWindow | null = null

function createMonitorWindow(): BrowserWindow {
  const primary = screen.getPrimaryDisplay()
  const w = 340
  const h = 212
  const win = new BrowserWindow({
    width: w,
    height: h,
    x: primary.workArea.x + primary.workArea.width - w - 24,
    y: primary.workArea.y + primary.workArea.height - h - 24,
    minWidth: 200,
    minHeight: 130,
    backgroundColor: '#000000',
    title: 'Recording Monitor',
    frame: false,
    resizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  // Float above everything, including other apps' full-screen spaces.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  win.on('closed', () => {
    if (monitorWindow === win) monitorWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#monitor`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'monitor' })
  }
  return win
}

export function registerMonitorHandlers(): void {
  ipcMain.handle('monitor:open', () => {
    if (!monitorWindow || monitorWindow.isDestroyed()) {
      monitorWindow = createMonitorWindow()
    } else {
      monitorWindow.focus()
    }
    return true
  })
  ipcMain.handle('monitor:close', () => {
    if (monitorWindow && !monitorWindow.isDestroyed()) monitorWindow.close()
    monitorWindow = null
    return true
  })
  ipcMain.handle('monitor:isOpen', () => monitorWindow != null && !monitorWindow.isDestroyed())
}

export function disposeMonitor(): void {
  if (monitorWindow && !monitorWindow.isDestroyed()) monitorWindow.close()
  monitorWindow = null
}
