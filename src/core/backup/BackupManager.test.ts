import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { BackupManager } from './BackupManager'

describe('BackupManager', () => {
  let root: string
  let target: string
  let manager: BackupManager

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'flashlight-backup-'))
    target = join(root, 'database.xml')
    await writeFile(target, 'original-content')
    manager = new BackupManager(join(root, 'appdata'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('snapshots a file and lists it back', async () => {
    const entry = await manager.snapshotFile(target, 'virtualdj-db')
    const backups = await manager.listBackups()
    expect(backups).toHaveLength(1)
    expect(backups[0].id).toBe(entry.id)
    expect(await readFile(entry.backupPath, 'utf-8')).toBe('original-content')
  })

  it('restores a backup over a mutated file', async () => {
    const entry = await manager.snapshotFile(target, 'virtualdj-db')
    await writeFile(target, 'corrupted-content')
    await manager.restoreBackup(entry.id)
    expect(await readFile(target, 'utf-8')).toBe('original-content')
  })

  it('prunes backups older than retention window but keeps the newest per file', async () => {
    const entry = await manager.snapshotFile(target, 'virtualdj-db')
    const backups = await manager.listBackups()
    backups[0].createdAt = new Date(Date.now() - 999 * 24 * 60 * 60 * 1000).toISOString()
    await writeFile(
      join(root, 'appdata', 'backups', 'manifest.json'),
      JSON.stringify(backups, null, 2)
    )

    const survivors = await manager.pruneBackups(14, 500 * 1024 * 1024)
    expect(survivors).toHaveLength(1)
    expect(survivors[0].id).toBe(entry.id)
  })

  it('prunes oldest-first when exceeding max total bytes, keeping newest per file', async () => {
    const targetB = join(root, 'other.xml')
    await writeFile(targetB, 'x'.repeat(1000))

    const first = await manager.snapshotFile(target, 'virtualdj-db')
    await new Promise((r) => setTimeout(r, 5))
    await writeFile(target, 'y'.repeat(1000))
    const second = await manager.snapshotFile(target, 'virtualdj-db')
    await new Promise((r) => setTimeout(r, 5))
    const third = await manager.snapshotFile(targetB, 'virtualdj-db')

    const survivors = await manager.pruneBackups(3650, 1500)
    const survivorIds = survivors.map((s) => s.id)

    expect(survivorIds).toContain(second.id)
    expect(survivorIds).toContain(third.id)
    expect(survivorIds).not.toContain(first.id)
  })
})
