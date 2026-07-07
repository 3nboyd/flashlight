import { ipcMain, app } from 'electron'
import { BackupManager } from '@core/backup/BackupManager'

let manager: BackupManager | null = null

export function getBackupManager(): BackupManager {
  if (!manager) {
    manager = new BackupManager(app.getPath('userData'))
  }
  return manager
}

export function registerBackupHandlers(): void {
  ipcMain.handle('backup:list', async () => getBackupManager().listBackups())
  ipcMain.handle('backup:prune', async (_event, retentionDays: number, maxTotalBytes: number) =>
    getBackupManager().pruneBackups(retentionDays, maxTotalBytes)
  )
  ipcMain.handle('backup:restore', async (_event, backupId: string) =>
    getBackupManager().restoreBackup(backupId)
  )
}
