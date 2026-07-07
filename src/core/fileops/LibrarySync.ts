import { promises as fs } from 'fs'
import { join } from 'path'
import type { BackupManager } from '../backup/BackupManager'
import { SeratoDatabase } from '../formats/serato/SeratoDatabase'
import { SeratoCrate } from '../formats/serato/SeratoCrate'
import { VirtualDjDatabase } from '../formats/virtualdj/VirtualDjDatabase'
import { toSeratoPath, type Platform } from '../library/seratoPath'

export interface LibrarySyncConfig {
  platform: Platform
  serato?: { databasePath: string; subcratesDir: string }
  virtualDj?: { databasePath: string }
}

export interface LibrarySyncResult {
  seratoDatabaseUpdated: boolean
  seratoCratesUpdated: string[]
  virtualDjUpdated: boolean
}

/**
 * Keeps Serato's database V2 / crates and VirtualDJ's database.xml pointed
 * at the right file after the app's file explorer moves or renames a
 * track. Every database file is snapshotted via BackupManager immediately
 * before it's overwritten. A file not being tracked by a given platform's
 * database is a normal no-op, not an error.
 */
export class LibrarySync {
  constructor(
    private readonly backupManager: BackupManager,
    private readonly config: LibrarySyncConfig
  ) {}

  async syncPathRename(oldAbsPath: string, newAbsPath: string): Promise<LibrarySyncResult> {
    const result: LibrarySyncResult = {
      seratoDatabaseUpdated: false,
      seratoCratesUpdated: [],
      virtualDjUpdated: false
    }

    if (this.config.serato) {
      result.seratoDatabaseUpdated = await this.syncSeratoDatabase(oldAbsPath, newAbsPath)
      result.seratoCratesUpdated = await this.syncSeratoCrates(oldAbsPath, newAbsPath)
    }

    if (this.config.virtualDj) {
      result.virtualDjUpdated = await this.syncVirtualDj(oldAbsPath, newAbsPath)
    }

    return result
  }

  private async syncSeratoDatabase(oldAbsPath: string, newAbsPath: string): Promise<boolean> {
    const { databasePath } = this.config.serato!
    const oldSeratoPath = toSeratoPath(oldAbsPath, this.config.platform)
    const newSeratoPath = toSeratoPath(newAbsPath, this.config.platform)

    let buf: Buffer
    try {
      buf = await fs.readFile(databasePath)
    } catch {
      return false
    }

    const db = SeratoDatabase.parse(buf)
    if (!db.updateTrackPath(oldSeratoPath, newSeratoPath)) return false

    await this.backupManager.snapshotFile(databasePath, 'serato-db')
    await fs.writeFile(databasePath, db.serialize())
    return true
  }

  private async syncSeratoCrates(oldAbsPath: string, newAbsPath: string): Promise<string[]> {
    const { subcratesDir } = this.config.serato!
    const oldSeratoPath = toSeratoPath(oldAbsPath, this.config.platform)
    const newSeratoPath = toSeratoPath(newAbsPath, this.config.platform)

    let entries: string[]
    try {
      entries = (await fs.readdir(subcratesDir)).filter((f) => f.endsWith('.crate'))
    } catch {
      return []
    }

    const updated: string[] = []
    for (const fileName of entries) {
      const cratePath = join(subcratesDir, fileName)
      const buf = await fs.readFile(cratePath)
      const crate = SeratoCrate.parse(buf)
      if (!crate.renameTrackPath(oldSeratoPath, newSeratoPath)) continue

      await this.backupManager.snapshotFile(cratePath, 'serato-crate')
      await fs.writeFile(cratePath, crate.serialize())
      updated.push(cratePath)
    }
    return updated
  }

  private async syncVirtualDj(oldAbsPath: string, newAbsPath: string): Promise<boolean> {
    const { databasePath } = this.config.virtualDj!

    let xmlText: string
    try {
      xmlText = await fs.readFile(databasePath, 'utf-8')
    } catch {
      return false
    }

    const db = VirtualDjDatabase.parse(xmlText)
    if (!db.updateFilePath(oldAbsPath, newAbsPath)) return false

    await this.backupManager.snapshotFile(databasePath, 'virtualdj-db')
    await fs.writeFile(databasePath, db.serialize(), 'utf-8')
    return true
  }
}
