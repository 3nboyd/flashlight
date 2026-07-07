import { describe, it, expect } from 'vitest'
import { VirtualDjDatabase } from './VirtualDjDatabase'

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<VirtualDJ_Database Version="1">
 <Song FilePath="C:/Music/track1.mp3" FileSize="5242880">
  <Tags Author="Artist One" Title="Track One" Genre="House" Bpm="128.00" />
  <Infos SongLength="240.5" Bitrate="320" PlayCount="4" />
  <Poi Name="Cue 1" Pos="15.912449" Num="1" />
  <Poi Name="Cue 2" Pos="17.436327" Num="2" />
  <Poi Pos="0.000000" Type="beatgrid" />
 </Song>
 <Song FilePath="C:/Music/track2.mp3" FileSize="4194304">
  <Tags Author="Artist &amp; Two" Title="Track &quot;Two&quot;" Genre="Techno" />
  <Infos SongLength="300.0" Bitrate="320" />
  <Comment>Some notes here</Comment>
 </Song>
</VirtualDJ_Database>
`

describe('VirtualDjDatabase', () => {
  it('lists songs with parsed attributes', () => {
    const db = VirtualDjDatabase.parse(SAMPLE_XML)
    const songs = db.listSongs()
    expect(songs).toHaveLength(2)
    expect(songs[0].attrs.FilePath).toBe('C:/Music/track1.mp3')
    expect(songs[1].attrs.FilePath).toBe('C:/Music/track2.mp3')
  })

  it('unescapes XML entities in attribute values', () => {
    const db = VirtualDjDatabase.parse(SAMPLE_XML)
    const song2 = db.findByPath('C:/Music/track2.mp3')!
    const tags = song2.children.find((c) => c.tag === 'Tags')!
    expect(tags.attrs.Author).toBe('Artist & Two')
    expect(tags.attrs.Title).toBe('Track "Two"')
  })

  it('serializes back byte-identical when nothing is modified', () => {
    const db = VirtualDjDatabase.parse(SAMPLE_XML)
    expect(db.serialize()).toBe(SAMPLE_XML)
  })

  it('reads hotcues, excluding non-hotcue Poi entries like beatgrid markers', () => {
    const db = VirtualDjDatabase.parse(SAMPLE_XML)
    const cues = db.getHotcues('C:/Music/track1.mp3')
    expect(cues).toEqual([
      { num: 1, positionSeconds: 15.912449, name: 'Cue 1' },
      { num: 2, positionSeconds: 17.436327, name: 'Cue 2' }
    ])
  })

  it('updates a file path and reformats only that song with VDJ 1-space/2-space indentation', () => {
    const db = VirtualDjDatabase.parse(SAMPLE_XML)
    expect(db.updateFilePath('C:/Music/track1.mp3', 'C:/Music/Renamed/track1.mp3')).toBe(true)

    const output = db.serialize()
    expect(output).toContain('<Song FilePath="C:/Music/Renamed/track1.mp3" FileSize="5242880">')

    const songLine = output.split('\n').find((l) => l.includes('Renamed/track1.mp3'))!
    expect(songLine.startsWith(' <Song')).toBe(true)
    expect(songLine.startsWith('  <Song')).toBe(false)

    const childLine = output.split('\n').find((l) => l.includes('Cue 1'))!
    expect(childLine.startsWith('  <Poi')).toBe(true)

    // Untouched second song must remain byte-identical to the original.
    const originalSecondSong = SAMPLE_XML.slice(SAMPLE_XML.indexOf('<Song FilePath="C:/Music/track2.mp3"'))
    expect(output).toContain(originalSecondSong.trimEnd())
  })

  it('returns false when updating a path that does not exist, without altering the file', () => {
    const db = VirtualDjDatabase.parse(SAMPLE_XML)
    expect(db.updateFilePath('C:/Music/missing.mp3', 'x.mp3')).toBe(false)
    expect(db.serialize()).toBe(SAMPLE_XML)
  })

  it('sets hotcues while preserving the beatgrid Poi and other children untouched', () => {
    const db = VirtualDjDatabase.parse(SAMPLE_XML)
    const ok = db.setHotcues('C:/Music/track1.mp3', [
      { num: 1, positionSeconds: 10, name: 'New Intro' },
      { num: 2, positionSeconds: 20, name: 'New Drop' },
      { num: 3, positionSeconds: 30 }
    ])
    expect(ok).toBe(true)

    const cues = db.getHotcues('C:/Music/track1.mp3')
    expect(cues).toEqual([
      { num: 1, positionSeconds: 10, name: 'New Intro' },
      { num: 2, positionSeconds: 20, name: 'New Drop' },
      { num: 3, positionSeconds: 30, name: undefined }
    ])

    const song = db.findByPath('C:/Music/track1.mp3')!
    const beatgridPoi = song.children.find((c) => c.tag === 'Poi' && c.attrs.Type === 'beatgrid')
    expect(beatgridPoi).toBeDefined()

    const output = db.serialize()
    expect(output).toContain('Type="beatgrid"')
  })

  it('preserves paired-tag children with text content, like <Comment>', () => {
    const db = VirtualDjDatabase.parse(SAMPLE_XML)
    db.updateFilePath('C:/Music/track2.mp3', 'C:/Music/track2-renamed.mp3')
    const output = db.serialize()
    expect(output).toContain('<Comment>Some notes here</Comment>')
  })
})
