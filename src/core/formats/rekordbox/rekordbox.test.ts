import { describe, it, expect } from 'vitest'
import { buildRekordboxXml, type RekordboxTrackInput } from './RekordboxExport'
import { parseRekordboxXml } from './RekordboxImport'
import { pathToFileUri, fileUriToPath } from './fileUri'

describe('fileUri', () => {
  it('round-trips a macOS-style path', () => {
    const path = '/Users/dj/Music/Track One.mp3'
    expect(fileUriToPath(pathToFileUri(path))).toBe(path)
  })

  it('round-trips a Windows-style path with drive letter', () => {
    const path = 'C:/Users/dj/Music/Track One.mp3'
    const uri = pathToFileUri(path)
    expect(uri).toBe('file://localhost/C:/Users/dj/Music/Track%20One.mp3')
    expect(fileUriToPath(uri)).toBe(path)
  })

  it('percent-encodes special characters in filenames', () => {
    const path = '/Users/dj/Music/Björk - Jóga (Extended Mix).mp3'
    const uri = pathToFileUri(path)
    expect(uri).not.toContain(' ')
    expect(fileUriToPath(uri)).toBe(path)
  })
})

describe('rekordbox XML export/import round-trip', () => {
  const tracks: RekordboxTrackInput[] = [
    {
      id: 1,
      filePath: '/Users/dj/Music/Track One.mp3',
      name: 'Track One',
      artist: 'Artist One',
      album: 'Album One',
      averageBpm: 128,
      totalTimeSeconds: 245,
      cues: [
        { num: 0, positionSeconds: 0, name: 'Intro' },
        { num: 1, positionSeconds: 32.5, name: 'Drop' }
      ],
      loops: [{ num: 0, startSeconds: 64, endSeconds: 72, name: 'Build' }],
      beatgrid: [{ positionSeconds: 0.025, bpm: 128 }]
    },
    {
      id: 2,
      filePath: '/Users/dj/Music/Track "Two" & More.mp3',
      name: 'Track "Two" & More',
      artist: 'Artist <Two>',
      cues: []
    }
  ]

  it('produces valid, importable XML with correct entry count', () => {
    const xml = buildRekordboxXml(tracks)
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('Entries="2"')

    const imported = parseRekordboxXml(xml)
    expect(imported).toHaveLength(2)
  })

  it('round-trips cues and loops for a track', () => {
    const imported = parseRekordboxXml(buildRekordboxXml(tracks))
    const track1 = imported.find((t) => t.name === 'Track One')!

    expect(track1.filePath).toBe('/Users/dj/Music/Track One.mp3')
    expect(track1.cues).toEqual([
      { name: 'Intro', positionSeconds: 0, num: 0 },
      { name: 'Drop', positionSeconds: 32.5, num: 1 }
    ])
    expect(track1.loops).toEqual([{ name: 'Build', startSeconds: 64, endSeconds: 72, num: 0 }])
  })

  it('escapes special XML characters in names/paths and recovers them on import', () => {
    const imported = parseRekordboxXml(buildRekordboxXml(tracks))
    const track2 = imported.find((t) => t.id === '2')!
    expect(track2.name).toBe('Track "Two" & More')
    expect(track2.artist).toBe('Artist <Two>')
    expect(track2.filePath).toBe('/Users/dj/Music/Track "Two" & More.mp3')
  })

  it('handles a track with no cues/loops (self-closing TRACK element)', () => {
    const xml = buildRekordboxXml([tracks[1]])
    expect(xml).toContain('<TRACK')
    expect(xml).toMatch(/<TRACK[^>]*\/>/)
    const imported = parseRekordboxXml(xml)
    expect(imported[0].cues).toEqual([])
    expect(imported[0].loops).toEqual([])
  })

  it('builds a PLAYLISTS section referencing track IDs', () => {
    const xml = buildRekordboxXml(tracks, [{ name: 'My Crate', trackIds: [1, 2] }])
    expect(xml).toContain('<NODE Name="My Crate" Type="1" KeyType="0" Entries="2">')
    expect(xml).toContain('<TRACK Key="1"/>')
    expect(xml).toContain('<TRACK Key="2"/>')
  })
})
