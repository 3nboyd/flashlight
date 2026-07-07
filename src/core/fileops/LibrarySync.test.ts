import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { BinaryWriter } from '@core/binary/BinaryWriter'
import { BackupManager } from '../backup/BackupManager'
import { LibrarySync } from './LibrarySync'
import { SeratoCrate } from '../formats/serato/SeratoCrate'
import { VirtualDjDatabase } from '../formats/virtualdj/VirtualDjDatabase'

function tlv(tag: string, payload: Buffer): Buffer {
  const w = new BinaryWriter()
  w.writeTag4(tag).writeUInt32BE(payload.length).writeBytes(payload)
  return w.toBuffer()
}
function utf16be(value: string): Buffer {
  return new BinaryWriter().writeUtf16BEString(value, false).toBuffer()
}
function buildFakeSeratoDb(paths: string[]): Buffer {
  const parts = [tlv('vrsn', utf16be('2.0/Serato Scratch LIVE Database'))]
  for (const p of paths) parts.push(tlv('otrk', tlv('pfil', utf16be(p))))
  return Buffer.concat(parts)
}

const VDJ_SAMPLE = `<VirtualDJ_Database Version="1">
 <Song FilePath="/Users/dj/Music/track1.mp3" FileSize="100">
  <Tags Title="Track One" />
  <Poi Name="Cue 1" Pos="10.000000" Num="1" />
 </Song>
</VirtualDJ_Database>
`

describe('LibrarySync', () => {
  let root: string
  let seratoDir: string
  let subcratesDir: string
  let seratoDbPath: string
  let vdjDbPath: string
  let backupManager: BackupManager
  let sync: LibrarySync

  const oldAbsPath = '/Users/dj/Music/track1.mp3'
  const newAbsPath = '/Users/dj/Music/Renamed/track1.mp3'
  const oldSeratoRelPath = 'Users/dj/Music/track1.mp3'
  const newSeratoRelPath = 'Users/dj/Music/Renamed/track1.mp3'

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'djapp-sync-'))
    seratoDir = join(root, '_Serato_')
    subcratesDir = join(seratoDir, 'Subcrates')
    await mkdir(subcratesDir, { recursive: true })

    seratoDbPath = join(seratoDir, 'database V2')
    await writeFile(seratoDbPath, buildFakeSeratoDb([oldSeratoRelPath, 'Users/dj/Music/other.mp3']))

    const crateWithTrack = SeratoCrate.createEmpty()
    crateWithTrack.addTrack(oldSeratoRelPath)
    await writeFile(join(subcratesDir, 'MyCrate.crate'), crateWithTrack.serialize())

    const crateWithoutTrack = SeratoCrate.createEmpty()
    crateWithoutTrack.addTrack('Users/dj/Music/unrelated.mp3')
    await writeFile(join(subcratesDir, 'OtherCrate.crate'), crateWithoutTrack.serialize())

    vdjDbPath = join(root, 'database.xml')
    await writeFile(vdjDbPath, VDJ_SAMPLE)

    backupManager = new BackupManager(join(root, 'appdata'))
    sync = new LibrarySync(backupManager, {
      platform: 'darwin',
      serato: { databasePath: seratoDbPath, subcratesDir },
      virtualDj: { databasePath: vdjDbPath }
    })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('updates the Serato database path and creates a backup', async () => {
    const result = await sync.syncPathRename(oldAbsPath, newAbsPath)
    expect(result.seratoDatabaseUpdated).toBe(true)

    const backups = await backupManager.listBackups()
    expect(backups.some((b) => b.category === 'serato-db')).toBe(true)

    const raw = await readFile(seratoDbPath)
    const { SeratoDatabase } = await import('../formats/serato/SeratoDatabase')
    const db = SeratoDatabase.parse(raw)
    expect(db.listTracks().map((t) => t.path)).toContain(newSeratoRelPath)
    expect(db.listTracks().map((t) => t.path)).toContain('Users/dj/Music/other.mp3')
  })

  it('updates only the crate that contains the renamed track', async () => {
    const result = await sync.syncPathRename(oldAbsPath, newAbsPath)
    expect(result.seratoCratesUpdated).toHaveLength(1)
    expect(result.seratoCratesUpdated[0]).toContain('MyCrate.crate')

    const updatedCrate = SeratoCrate.parse(await readFile(join(subcratesDir, 'MyCrate.crate')))
    expect(updatedCrate.listTrackPaths()).toContain(newSeratoRelPath)

    const untouchedCrate = SeratoCrate.parse(await readFile(join(subcratesDir, 'OtherCrate.crate')))
    expect(untouchedCrate.listTrackPaths()).toEqual(['Users/dj/Music/unrelated.mp3'])
  })

  it('updates VirtualDJ database.xml and preserves its hotcues/whitespace convention', async () => {
    const result = await sync.syncPathRename(oldAbsPath, newAbsPath)
    expect(result.virtualDjUpdated).toBe(true)

    const xml = await readFile(vdjDbPath, 'utf-8')
    const db = VirtualDjDatabase.parse(xml)
    const song = db.findByPath(newAbsPath)
    expect(song).toBeDefined()
    expect(db.getHotcues(newAbsPath)).toEqual([{ num: 1, positionSeconds: 10, name: 'Cue 1' }])

    const backups = await backupManager.listBackups()
    expect(backups.some((b) => b.category === 'virtualdj-db')).toBe(true)
  })

  it('is a no-op (no error, no backup) for a path unknown to any database', async () => {
    const result = await sync.syncPathRename('/Users/dj/Music/never-seen.mp3', '/Users/dj/Music/x.mp3')
    expect(result).toEqual({
      seratoDatabaseUpdated: false,
      seratoCratesUpdated: [],
      virtualDjUpdated: false
    })
    expect(await backupManager.listBackups()).toHaveLength(0)
  })
})
