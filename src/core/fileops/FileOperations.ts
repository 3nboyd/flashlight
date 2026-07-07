import { promises as fs } from 'fs'
import { join, basename, dirname } from 'path'

export interface DirEntryInfo {
  name: string
  path: string
  isDirectory: boolean
  sizeBytes: number
  modifiedAt: string
}

export async function listDirectory(dirPath: string): Promise<DirEntryInfo[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const results: DirEntryInfo[] = []
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    const stat = await fs.stat(fullPath)
    results.push({
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory(),
      sizeBytes: stat.isDirectory() ? 0 : stat.size,
      modifiedAt: stat.mtime.toISOString()
    })
  }
  return results
}

async function ensureDestinationAvailable(destPath: string): Promise<void> {
  try {
    await fs.access(destPath)
    throw new Error(`Destination already exists: ${destPath}`)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Destination already exists')) throw err
    // ENOENT is the expected/good outcome here.
  }
}

export interface FileMoveResult {
  from: string
  to: string
}

export async function moveEntry(fromPath: string, toDir: string): Promise<FileMoveResult> {
  const destPath = join(toDir, basename(fromPath))
  await ensureDestinationAvailable(destPath)
  await fs.mkdir(toDir, { recursive: true })
  await fs.rename(fromPath, destPath)
  return { from: fromPath, to: destPath }
}

export async function renameEntry(entryPath: string, newName: string): Promise<FileMoveResult> {
  const destPath = join(dirname(entryPath), newName)
  await ensureDestinationAvailable(destPath)
  await fs.rename(entryPath, destPath)
  return { from: entryPath, to: destPath }
}

async function copyRecursive(src: string, dest: string): Promise<void> {
  const stat = await fs.stat(src)
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true })
    const children = await fs.readdir(src)
    for (const child of children) {
      await copyRecursive(join(src, child), join(dest, child))
    }
  } else {
    await fs.copyFile(src, dest)
  }
}

export async function copyEntry(fromPath: string, toDir: string): Promise<FileMoveResult> {
  const destPath = join(toDir, basename(fromPath))
  await ensureDestinationAvailable(destPath)
  await fs.mkdir(toDir, { recursive: true })
  await copyRecursive(fromPath, destPath)
  return { from: fromPath, to: destPath }
}

export async function deleteEntry(entryPath: string): Promise<void> {
  await fs.rm(entryPath, { recursive: true, force: false })
}

export async function createFolder(parentDir: string, name: string): Promise<string> {
  const destPath = join(parentDir, name)
  await ensureDestinationAvailable(destPath)
  await fs.mkdir(destPath)
  return destPath
}

/** Batch variant used for mass-select operations in the file explorer UI. */
export async function moveEntries(paths: string[], toDir: string): Promise<FileMoveResult[]> {
  const results: FileMoveResult[] = []
  for (const path of paths) {
    results.push(await moveEntry(path, toDir))
  }
  return results
}

export async function copyEntries(paths: string[], toDir: string): Promise<FileMoveResult[]> {
  const results: FileMoveResult[] = []
  for (const path of paths) {
    results.push(await copyEntry(path, toDir))
  }
  return results
}
