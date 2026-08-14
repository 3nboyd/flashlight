import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { registerSettingsHandlers } from './ipc/settings'
import { registerBackupHandlers } from './ipc/backup'
import { registerDialogHandlers } from './ipc/dialog'
import { registerLibraryHandlers } from './ipc/library'
import { registerFileOpsHandlers } from './ipc/fileops'
import { registerRenameHandlers } from './ipc/rename'
import { registerLightingHandlers, disposeLighting } from './ipc/lighting'
import { registerOutputHandlers, disposeOutput } from './ipc/output'

const isMac = process.platform === 'darwin'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    backgroundColor: '#121212',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Keep the renderer (audio analysis, engine tick) running at full rate
      // when the window is backgrounded/occluded - the DJ is looking at their
      // deck software, not this app, and the lights must not stall.
      backgroundThrottling: false
    }
  })

  // Grant camera/microphone to our own renderer (getUserMedia). The OS-level
  // (macOS TCC) prompt still gates real access on first use.
  const allow = (permission: string): boolean =>
    ['media', 'camera', 'microphone', 'audioCapture', 'videoCapture'].includes(permission)
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allow(permission)))
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allow(permission))

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('app:getVersion', () => app.getVersion())

  registerSettingsHandlers()
  registerBackupHandlers()
  registerDialogHandlers()
  registerLibraryHandlers()
  registerFileOpsHandlers()
  registerRenameHandlers()
  registerLightingHandlers()
  registerOutputHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

app.on('before-quit', () => {
  // Stops the DMX loop and sends a final blackout so fixtures don't freeze lit.
  disposeLighting()
  disposeOutput()
})
