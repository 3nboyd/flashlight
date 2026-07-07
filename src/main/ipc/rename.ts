import { ipcMain } from 'electron'
import { extname, basename } from 'path'
import { buildBatchRenamePreview, type RenameCandidateInput, type RenamePreview } from '@core/rename/RenameEngine'
import { renameEntry } from '@core/fileops/FileOperations'
import { LibrarySync } from '@core/fileops/LibrarySync'
import { readSettings } from './settings'
import { getBackupManager } from './backup'
import { buildLibrarySyncConfig } from '../librarySyncConfig'

export interface RenameApplyItem {
  filePath: string
  suggestedBaseName: string
}

export function registerRenameHandlers(): void {
  ipcMain.handle(
    'rename:preview',
    async (_event, candidates: RenameCandidateInput[], knownArtists: string[]): Promise<RenamePreview[]> => {
      return buildBatchRenamePreview(candidates, knownArtists)
    }
  )

  ipcMain.handle('rename:apply', async (_event, items: RenameApplyItem[]) => {
    const settings = await readSettings()
    const config = buildLibrarySyncConfig(settings)
    const sync = config.serato || config.virtualDj ? new LibrarySync(getBackupManager(), config) : null

    const results = []
    for (const item of items) {
      const ext = extname(item.filePath)
      const currentName = basename(item.filePath)
      const newName = `${item.suggestedBaseName}${ext}`
      if (newName === currentName) continue

      const moveResult = await renameEntry(item.filePath, newName)
      const syncResult = sync ? await sync.syncPathRename(moveResult.from, moveResult.to) : null
      results.push({ ...moveResult, sync: syncResult })
    }
    return results
  })
}
