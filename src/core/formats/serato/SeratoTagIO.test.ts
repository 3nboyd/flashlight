import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import NodeID3 from 'node-id3'
import { readSeratoTags, writeMarkers2Tags, writeBeatGridTags } from './SeratoTagIO'
import type { Markers2Entry } from './markers2'
import type { BeatGrid } from './beatgrid'

describe('SeratoTagIO (real MP3 file via node-id3)', () => {
  let dir: string
  let filePath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'flashlight-id3-'))
    filePath = join(dir, 'track.mp3')
    // Minimal placeholder "audio" bytes - node-id3 doesn't validate MPEG frame sync.
    await writeFile(filePath, Buffer.from([0xff, 0xfb, 0x90, 0x00, ...new Array(64).fill(0)]))
    NodeID3.write(
      {
        title: 'Test Track',
        artist: 'Test Artist',
        album: 'Test Album'
      },
      filePath
    )
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reads null for markers2/beatgrid when no Serato tags are present', () => {
    const tags = readSeratoTags(filePath)
    expect(tags.markers2).toBeNull()
    expect(tags.beatgrid).toBeNull()
  })

  it('writes and reads back hotcues without disturbing title/artist/album', () => {
    const entries: Markers2Entry[] = [
      { kind: 'cue', index: 0, positionMs: 0, color: [204, 0, 0], name: 'Intro' },
      { kind: 'cue', index: 1, positionMs: 32500, color: [0, 204, 0], name: 'Drop' }
    ]
    writeMarkers2Tags(filePath, entries)

    const tags = readSeratoTags(filePath)
    expect(tags.markers2).toEqual(entries)

    const standardTags = NodeID3.read(filePath)
    expect(standardTags.title).toBe('Test Track')
    expect(standardTags.artist).toBe('Test Artist')
    expect(standardTags.album).toBe('Test Album')
  })

  it('writing beatgrid does not clobber previously written markers2, and vice versa', () => {
    const cues: Markers2Entry[] = [
      { kind: 'cue', index: 0, positionMs: 1000, color: [1, 2, 3], name: 'A' }
    ]
    const grid: BeatGrid = {
      markers: [{ terminal: true, positionSeconds: 0, bpm: 128 }],
      footer: Buffer.alloc(0)
    }

    writeMarkers2Tags(filePath, cues)
    writeBeatGridTags(filePath, grid)

    const tags = readSeratoTags(filePath)
    expect(tags.markers2).toEqual(cues)
    expect(tags.beatgrid?.markers).toHaveLength(1)

    // Now update markers2 again and confirm beatgrid survives (this is the
    // exact scenario where node-id3's own update() would corrupt things).
    const newCues: Markers2Entry[] = [
      { kind: 'cue', index: 0, positionMs: 5000, color: [9, 9, 9], name: 'B' }
    ]
    writeMarkers2Tags(filePath, newCues)
    const tagsAfter = readSeratoTags(filePath)
    expect(tagsAfter.markers2).toEqual(newCues)
    expect(tagsAfter.beatgrid?.markers).toHaveLength(1)
    expect(tagsAfter.beatgrid?.markers[0]).toMatchObject({ terminal: true, bpm: 128 })
  })

  it('a decoy third-party GEOB frame survives a markers2 write untouched', () => {
    NodeID3.update(
      {
        generalObject: [
          {
            mimeType: 'application/octet-stream',
            filename: '',
            contentDescription: 'Some Other App Data',
            encapsulatedObject: Buffer.from('do-not-touch')
          }
        ]
      },
      filePath
    )

    writeMarkers2Tags(filePath, [
      { kind: 'cue', index: 0, positionMs: 0, color: [1, 1, 1], name: 'X' }
    ])

    const raw = NodeID3.read(filePath)
    const decoy = (raw.generalObject as Array<{ contentDescription: string; encapsulatedObject: Buffer }>).find(
      (o) => o.contentDescription === 'Some Other App Data'
    )
    expect(decoy?.encapsulatedObject.toString()).toBe('do-not-touch')
  })
})
