import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { registerSettingsHandlers } from './ipc/settings'
import { registerBackupHandlers } from './ipc/backup'
import { registerDialogHandlers } from './ipc/dialog'
import { registerLibraryHandlers } from './ipc/library'
import { registerFileOpsHandlers } from './ipc/fileops'
import { registerRenameHandlers } from './ipc/rename'

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
      nodeIntegration: false
    }
  })

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

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})
