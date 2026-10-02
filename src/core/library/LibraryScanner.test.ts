import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import NodeID3 from 'node-id3'
import { scanLibraryFolder, scanTrack } from './LibraryScanner'
import { writeMarkers2Tags } from '../formats/serato/SeratoTagIO'
import type { Markers2Entry } from '../formats/serato/markers2'

function fakeMp3Bytes(): Buffer {
  return Buffer.from([0xff, 0xfb, 0x90, 0x00, ...new Array(256).fill(0)])
}

describe('LibraryScanner', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'flashlight-scan-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reads standard metadata for a single MP3 track', async () => {
    const filePath = join(dir, 'track.mp3')
    await writeFile(filePath, fakeMp3Bytes())
    NodeID3.write({ title: 'My Track', artist: 'My Artist', album: 'My Album', genre: 'House' }, filePath)

    const track = await scanTrack(filePath)
    expect(track.metadata.title).toBe('My Track')
    expect(track.metadata.artist).toBe('My Artist')
    expect(track.metadata.genre).toBe('House')
    expect(track.format).toBe('mp3')
    expect(track.sources.serato).toBe(false)
  })

  it('picks up embedded Serato hotcues when present', async () => {
    const filePath = join(dir, 'track-with-cues.mp3')
    await writeFile(filePath, fakeMp3Bytes())
    NodeID3.write({ title: 'Cued Track' }, filePath)

    const entries: Markers2Entry[] = [
      { kind: 'cue', index: 0, positionMs: 1000, color: [204, 0, 0], name: 'Intro' },
      { kind: 'cue', index: 1, positionMs: 32000, color: [0, 204, 0], name: 'Drop' }
    ]
    writeMarkers2Tags(filePath, entries)

    const track = await scanTrack(filePath)
    expect(track.sources.serato).toBe(true)
    expect(track.cues).toHaveLength(2)
    expect(track.cues[1]).toMatchObject({ index: 1, positionMs: 32000, name: 'Drop' })
  })

  it('recursively scans nested folders and skips non-audio files', async () => {
    await mkdir(join(dir, 'Subfolder'), { recursive: true })
    await writeFile(join(dir, 'track1.mp3'), fakeMp3Bytes())
    NodeID3.write({ title: 'Root Track' }, join(dir, 'track1.mp3'))
    await writeFile(join(dir, 'Subfolder', 'track2.mp3'), fakeMp3Bytes())
    NodeID3.write({ title: 'Nested Track' }, join(dir, 'Subfolder', 'track2.mp3'))
    await writeFile(join(dir, 'readme.txt'), 'not audio')

    const { tracks } = await scanLibraryFolder(dir)
    expect(tracks).toHaveLength(2)
    expect(tracks.map((t) => t.metadata.title).sort()).toEqual(['Nested Track', 'Root Track'])
  })

  it('skips unreadable files instead of throwing, and reports them as errors', async () => {
    const corruptPath = join(dir, 'corrupt.mp3')
    await writeFile(corruptPath, Buffer.from('not a real mp3 at all'))
    await writeFile(join(dir, 'good.mp3'), fakeMp3Bytes())
    NodeID3.write({ title: 'Good Track' }, join(dir, 'good.mp3'))

    const { tracks, errors } = await scanLibraryFolder(dir)
    expect(tracks.some((t) => t.metadata.title === 'Good Track')).toBe(true)
    expect(errors).toHaveLength(1)
    expect(errors[0].filePath).toBe(corruptPath)
  })
})
