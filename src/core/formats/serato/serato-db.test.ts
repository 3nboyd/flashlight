import { describe, it, expect } from 'vitest'
import { BinaryWriter } from '@core/binary/BinaryWriter'
import { parseRecords, serializeRecords } from './records'
import { SeratoDatabase } from './SeratoDatabase'
import { SeratoCrate } from './SeratoCrate'

function tlv(tag: string, payload: Buffer): Buffer {
  const w = new BinaryWriter()
  w.writeTag4(tag).writeUInt32BE(payload.length).writeBytes(payload)
  return w.toBuffer()
}

function utf16be(value: string): Buffer {
  return new BinaryWriter().writeUtf16BEString(value, false).toBuffer()
}

/** Builds a minimal but realistic database V2 buffer with two tracks, one
 *  bool field and one uint32 field we deliberately don't model, to prove
 *  unknown fields survive an untouched round-trip and a targeted edit. */
function buildFakeDatabase(): Buffer {
  const track1 = Buffer.concat([
    tlv('pfil', utf16be('Users/dj/Music/track1.mp3')),
    tlv('tsng', utf16be('Track One')),
    tlv('tart', utf16be('Artist One')),
    tlv('bmis', Buffer.from([0])),
    tlv('ulbl', Buffer.from([0, 0, 0, 42]))
  ])
  const track2 = Buffer.concat([
    tlv('pfil', utf16be('Users/dj/Music/track2.mp3')),
    tlv('tsng', utf16be('Track Two'))
  ])

  return Buffer.concat([
    tlv('vrsn', utf16be('2.0/Serato Scratch LIVE Database')),
    tlv('otrk', track1),
    tlv('otrk', track2)
  ])
}

function buildFakeCrate(paths: string[]): Buffer {
  const parts = [tlv('vrsn', utf16be('1.0/Serato ScratchLive Crate'))]
  for (const p of paths) {
    parts.push(tlv('otrk', tlv('ptrk', utf16be(p))))
  }
  return Buffer.concat(parts)
}

describe('Serato records TLV', () => {
  it('round-trips an untouched buffer byte-for-byte', () => {
    const original = buildFakeDatabase()
    const records = parseRecords(original)
    const reserialized = serializeRecords(records)
    expect(reserialized.equals(original)).toBe(true)
  })
})

describe('SeratoDatabase', () => {
  it('lists tracks by path', () => {
    const db = SeratoDatabase.parse(buildFakeDatabase())
    const tracks = db.listTracks()
    expect(tracks.map((t) => t.path)).toEqual([
      'Users/dj/Music/track1.mp3',
      'Users/dj/Music/track2.mp3'
    ])
  })

  it('updates a track path and preserves unmodeled sibling fields', () => {
    const original = buildFakeDatabase()
    const db = SeratoDatabase.parse(original)
    const found = db.updateTrackPath(
      'Users/dj/Music/track1.mp3',
      'Users/dj/Music/Renamed/track1.mp3'
    )
    expect(found).toBe(true)

    const reparsed = SeratoDatabase.parse(db.serialize())
    const tracks = reparsed.listTracks()
    expect(tracks[0].path).toBe('Users/dj/Music/Renamed/track1.mp3')
    expect(tracks[1].path).toBe('Users/dj/Music/track2.mp3')

    // bmis/ulbl fields on track1 must survive untouched despite track1's edit
    const rawRecords = parseRecords(db.serialize())
    const track1Record = rawRecords.find((r) => r.tag === 'otrk')
    expect(track1Record?.decoded.kind).toBe('container')
    if (track1Record?.decoded.kind === 'container') {
      const bmis = track1Record.decoded.children.find((c) => c.tag === 'bmis')
      const ulbl = track1Record.decoded.children.find((c) => c.tag === 'ulbl')
      expect(bmis?.decoded).toEqual({ kind: 'bool', value: false })
      expect(ulbl?.decoded).toEqual({ kind: 'uint32', value: 42 })
    }
  })

  it('returns false when updating a path that does not exist', () => {
    const db = SeratoDatabase.parse(buildFakeDatabase())
    expect(db.updateTrackPath('nonexistent.mp3', 'new.mp3')).toBe(false)
  })

  it('leaves other tracks byte-identical when one track is edited', () => {
    const original = buildFakeDatabase()
    const db = SeratoDatabase.parse(original)
    db.updateTrackPath('Users/dj/Music/track1.mp3', 'Users/dj/Music/track1-renamed.mp3')

    const originalRecords = parseRecords(original)
    const editedRecords = parseRecords(db.serialize())
    // index 2 is the second otrk (index 0 = vrsn, 1 = track1's otrk, 2 = track2's otrk)
    expect(editedRecords[2].raw.equals(originalRecords[2].raw)).toBe(true)
  })
})

describe('SeratoCrate', () => {
  it('lists track paths', () => {
    const crate = SeratoCrate.parse(buildFakeCrate(['a.mp3', 'b.mp3']))
    expect(crate.listTrackPaths()).toEqual(['a.mp3', 'b.mp3'])
  })

  it('adds a track without duplicating', () => {
    const crate = SeratoCrate.parse(buildFakeCrate(['a.mp3']))
    crate.addTrack('b.mp3')
    crate.addTrack('a.mp3')
    expect(crate.listTrackPaths()).toEqual(['a.mp3', 'b.mp3'])
  })

  it('removes a track', () => {
    const crate = SeratoCrate.parse(buildFakeCrate(['a.mp3', 'b.mp3']))
    expect(crate.removeTrack('a.mp3')).toBe(true)
    expect(crate.listTrackPaths()).toEqual(['b.mp3'])
  })

  it('renames a track path in place, preserving order', () => {
    const crate = SeratoCrate.parse(buildFakeCrate(['a.mp3', 'b.mp3', 'c.mp3']))
    expect(crate.renameTrackPath('b.mp3', 'b-renamed.mp3')).toBe(true)
    expect(crate.listTrackPaths()).toEqual(['a.mp3', 'b-renamed.mp3', 'c.mp3'])
  })

  it('creates a fresh empty crate that reparses cleanly', () => {
    const crate = SeratoCrate.createEmpty()
    crate.addTrack('new-track.mp3')
    const reparsed = SeratoCrate.parse(crate.serialize())
    expect(reparsed.listTrackPaths()).toEqual(['new-track.mp3'])
  })
})
