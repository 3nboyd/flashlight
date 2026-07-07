import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join, relative } from 'path'
import {
  listDirectory,
  moveEntry,
  renameEntry,
  copyEntry,
  deleteEntry,
  createFolder,
  moveEntries,
  copyEntries,
  type DirEntryInfo,
  type FileMoveResult
} from '@core/fileops/FileOperations'
import { LibrarySync, type LibrarySyncResult } from '@core/fileops/LibrarySync'
import { readSettings } from './settings'
import { getBackupManager } from './backup'
import { buildLibrarySyncConfig } from '../librarySyncConfig'

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(full)))
    } else {
      files.push(full)
    }
  }
  return files
}

/**
 * After a move/rename, tells every configured DJ database (Serato,
 * VirtualDJ) about the new location. For a moved folder, walks the new
 * location and re-derives each contained file's old path by substituting
 * the folder prefix, so nested tracks stay in sync too.
 */
async function syncAfterMove(result: FileMoveResult): Promise<LibrarySyncResult[]> {
  const settings = await readSettings()
  const config = buildLibrarySyncConfig(settings)
  if (!config.serato && !config.virtualDj) return []

  const sync = new LibrarySync(getBackupManager(), config)
  const destStat = await fs.stat(result.to)

  if (!destStat.isDirectory()) {
    return [await sync.syncPathRename(result.from, result.to)]
  }

  const newFiles = await listFilesRecursive(result.to)
  const results: LibrarySyncResult[] = []
  for (const newFile of newFiles) {
    const relPath = relative(result.to, newFile)
    const oldFile = join(result.from, relPath)
    results.push(await sync.syncPathRename(oldFile, newFile))
  }
  return results
}

export function registerFileOpsHandlers(): void {
  ipcMain.handle('fileops:list', async (_event, dirPath: string): Promise<DirEntryInfo[]> => {
    return listDirectory(dirPath)
  })

  ipcMain.handle('fileops:move', async (_event, fromPath: string, toDir: string) => {
    const result = await moveEntry(fromPath, toDir)
    const sync = await syncAfterMove(result)
    return { result, sync }
  })

  ipcMain.handle('fileops:rename', async (_event, entryPath: string, newName: string) => {
    const result = await renameEntry(entryPath, newName)
    const sync = await syncAfterMove(result)
    return { result, sync }
  })

  ipcMain.handle('fileops:copy', async (_event, fromPath: string, toDir: string) => {
    return copyEntry(fromPath, toDir)
  })

  ipcMain.handle('fileops:delete', async (_event, entryPath: string) => {
    await deleteEntry(entryPath)
  })

  ipcMain.handle('fileops:createFolder', async (_event, parentDir: string, name: string) => {
    return createFolder(parentDir, name)
  })

  ipcMain.handle('fileops:moveMany', async (_event, paths: string[], toDir: string) => {
    const results = await moveEntries(paths, toDir)
    const sync: LibrarySyncResult[] = []
    for (const result of results) {
      sync.push(...(await syncAfterMove(result)))
    }
    return { results, sync }
  })

  ipcMain.handle('fileops:copyMany', async (_event, paths: string[], toDir: string) => {
    return copyEntries(paths, toDir)
  })
}
