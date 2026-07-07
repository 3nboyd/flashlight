import { ipcMain } from 'electron'
import { scanLibraryFolder, type ScanResult } from '@core/library/LibraryScanner'
import { readSettings } from './settings'

export function registerLibraryHandlers(): void {
  ipcMain.handle('library:scanFolder', async (_event, folderPath: string): Promise<ScanResult> => {
    return scanLibraryFolder(folderPath)
  })

  ipcMain.handle('library:scanConfiguredFolders', async (): Promise<ScanResult> => {
    const settings = await readSettings()
    const combined: ScanResult = { tracks: [], errors: [] }
    for (const folder of settings.libraryFolders) {
      const result = await scanLibraryFolder(folder)
      combined.tracks.push(...result.tracks)
      combined.errors.push(...result.errors)
    }
    return combined
  })
}
