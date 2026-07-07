import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, readdir, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  listDirectory,
  moveEntry,
  renameEntry,
  copyEntry,
  deleteEntry,
  createFolder,
  moveEntries
} from './FileOperations'

describe('FileOperations', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'djapp-fileops-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('lists directory entries with type and size info', async () => {
    await writeFile(join(dir, 'a.mp3'), 'hello')
    await mkdir(join(dir, 'Sub'))

    const entries = await listDirectory(dir)
    const file = entries.find((e) => e.name === 'a.mp3')!
    const folder = entries.find((e) => e.name === 'Sub')!
    expect(file.isDirectory).toBe(false)
    expect(file.sizeBytes).toBe(5)
    expect(folder.isDirectory).toBe(true)
  })

  it('moves a file into another directory', async () => {
    const src = join(dir, 'track.mp3')
    await writeFile(src, 'audio-bytes')
    const destDir = join(dir, 'Crate')
    await mkdir(destDir)

    const result = await moveEntry(src, destDir)
    expect(result.to).toBe(join(destDir, 'track.mp3'))
    expect(await readdir(dir)).not.toContain('track.mp3')
    expect(await readFile(result.to, 'utf-8')).toBe('audio-bytes')
  })

  it('refuses to move onto an existing destination file', async () => {
    const src = join(dir, 'track.mp3')
    await writeFile(src, 'A')
    const destDir = join(dir, 'Crate')
    await mkdir(destDir)
    await writeFile(join(destDir, 'track.mp3'), 'B')

    await expect(moveEntry(src, destDir)).rejects.toThrow(/already exists/)
    expect(await readFile(join(destDir, 'track.mp3'), 'utf-8')).toBe('B')
  })

  it('renames a file in place', async () => {
    const src = join(dir, 'old-name.mp3')
    await writeFile(src, 'x')
    const result = await renameEntry(src, 'new-name.mp3')
    expect(result.to).toBe(join(dir, 'new-name.mp3'))
    expect(await readdir(dir)).toEqual(['new-name.mp3'])
  })

  it('copies a file, leaving the original in place', async () => {
    const src = join(dir, 'track.mp3')
    await writeFile(src, 'audio-bytes')
    const destDir = join(dir, 'Backup')
    await mkdir(destDir)

    await copyEntry(src, destDir)
    expect(await readFile(src, 'utf-8')).toBe('audio-bytes')
    expect(await readFile(join(destDir, 'track.mp3'), 'utf-8')).toBe('audio-bytes')
  })

  it('copies a directory recursively', async () => {
    const srcDir = join(dir, 'Crate')
    await mkdir(srcDir)
    await writeFile(join(srcDir, 'a.mp3'), 'a')
    await mkdir(join(srcDir, 'Nested'))
    await writeFile(join(srcDir, 'Nested', 'b.mp3'), 'b')

    const destParent = join(dir, 'Dest')
    await mkdir(destParent)
    await copyEntry(srcDir, destParent)

    expect(await readFile(join(destParent, 'Crate', 'a.mp3'), 'utf-8')).toBe('a')
    expect(await readFile(join(destParent, 'Crate', 'Nested', 'b.mp3'), 'utf-8')).toBe('b')
  })

  it('deletes a file', async () => {
    const src = join(dir, 'track.mp3')
    await writeFile(src, 'x')
    await deleteEntry(src)
    expect(await readdir(dir)).toEqual([])
  })

  it('creates a new folder and rejects duplicates', async () => {
    const created = await createFolder(dir, 'New Crate')
    expect(created).toBe(join(dir, 'New Crate'))
    await expect(createFolder(dir, 'New Crate')).rejects.toThrow(/already exists/)
  })

  it('moves multiple entries in a batch', async () => {
    await writeFile(join(dir, 'a.mp3'), 'a')
    await writeFile(join(dir, 'b.mp3'), 'b')
    const destDir = join(dir, 'Dest')

    const results = await moveEntries([join(dir, 'a.mp3'), join(dir, 'b.mp3')], destDir)
    expect(results).toHaveLength(2)
    expect((await readdir(destDir)).sort()).toEqual(['a.mp3', 'b.mp3'])
  })
})
