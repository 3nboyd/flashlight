import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { join, basename, dirname } from 'path'
import type { BackupEntry } from './types'

const MANIFEST_FILENAME = 'manifest.json'
const BACKUPS_DIRNAME = 'backups'

/**
 * Snapshots files before any mutating write to a DJ database or embedded-tag
 * write, so a parsing gap can never destroy the user's only copy of their
 * library metadata. Retention is time- and size-bounded so backups don't
 * grow unbounded on disk.
 */
export class BackupManager {
  private readonly backupsRoot: string
  private readonly manifestPath: string
  private manifestCache: BackupEntry[] | null = null
  private writeQueue: Promise<unknown> = Promise.resolve()

  constructor(appDataRoot: string) {
    this.backupsRoot = join(appDataRoot, BACKUPS_DIRNAME)
    this.manifestPath = join(this.backupsRoot, MANIFEST_FILENAME)
  }

  async snapshotFile(
    originalPath: string,
    category: BackupEntry['category']
  ): Promise<BackupEntry> {
    const stat = await fs.stat(originalPath)
    if (!stat.isFile()) {
      throw new Error(`Cannot back up non-file path: ${originalPath}`)
    }

    const id = randomUUID()
    const categoryDir = join(this.backupsRoot, category)
    await fs.mkdir(categoryDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = join(categoryDir, `${timestamp}_${id.slice(0, 8)}_${basename(originalPath)}`)

    await fs.copyFile(originalPath, backupPath)

    const entry: BackupEntry = {
      id,
      category,
      originalPath,
      backupPath,
      sizeBytes: stat.size,
      createdAt: new Date().toISOString()
    }

    await this.appendManifest(entry)
    return entry
  }

  async listBackups(): Promise<BackupEntry[]> {
    return [...(await this.readManifest())]
  }

  async restoreBackup(backupId: string): Promise<BackupEntry> {
    const entries = await this.readManifest()
    const entry = entries.find((e) => e.id === backupId)
    if (!entry) {
      throw new Error(`No backup found with id ${backupId}`)
    }
    await fs.mkdir(dirname(entry.originalPath), { recursive: true })
    await fs.copyFile(entry.backupPath, entry.originalPath)
    return entry
  }

  /**
   * Deletes backups older than retentionDays, then - if still over budget -
   * deletes the oldest remaining backups until under maxTotalBytes. Always
   * keeps at least the single most recent backup per (category, originalPath)
   * pair so there is never zero recovery option for a tracked file.
   */
  async pruneBackups(retentionDays: number, maxTotalBytes: number): Promise<BackupEntry[]> {
    const entries = await this.readManifest()
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000

    const mostRecentByKey = new Map<string, string>()
    for (const entry of [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      mostRecentByKey.set(`${entry.category}:${entry.originalPath}`, entry.id)
    }

    let survivors = entries.filter((entry) => {
      const isNewestForKey = mostRecentByKey.get(`${entry.category}:${entry.originalPath}`) === entry.id
      const isExpired = new Date(entry.createdAt).getTime() < cutoff
      return isNewestForKey || !isExpired
    })

    let totalBytes = survivors.reduce((sum, e) => sum + e.sizeBytes, 0)
    if (totalBytes > maxTotalBytes) {
      const sortedByAge = [...survivors].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const keepIds = new Set(mostRecentByKey.values())
      for (const entry of sortedByAge) {
        if (totalBytes <= maxTotalBytes) break
        if (keepIds.has(entry.id)) continue
        survivors = survivors.filter((e) => e.id !== entry.id)
        totalBytes -= entry.sizeBytes
      }
    }

    const removed = entries.filter((e) => !survivors.includes(e))
    for (const entry of removed) {
      await fs.rm(entry.backupPath, { force: true })
    }

    await this.writeManifest(survivors)
    return survivors
  }

  private async readManifest(): Promise<BackupEntry[]> {
    if (this.manifestCache) return this.manifestCache
    try {
      const raw = await fs.readFile(this.manifestPath, 'utf-8')
      this.manifestCache = JSON.parse(raw) as BackupEntry[]
    } catch {
      this.manifestCache = []
    }
    return this.manifestCache
  }

  private async writeManifest(entries: BackupEntry[]): Promise<void> {
    this.manifestCache = entries
    await fs.mkdir(this.backupsRoot, { recursive: true })
    await fs.writeFile(this.manifestPath, JSON.stringify(entries, null, 2), 'utf-8')
  }

  private async appendManifest(entry: BackupEntry): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const entries = await this.readManifest()
      entries.push(entry)
      await this.writeManifest(entries)
    })
    await this.writeQueue
  }
}
