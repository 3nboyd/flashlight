import { describe, it, expect } from 'vitest'
import {
  parseMarkers2,
  serializeMarkers2,
  getCues,
  getLoops,
  withCues,
  type Markers2Entry,
  type CueEntry
} from './markers2'

describe('Serato Markers2', () => {
  it('round-trips a realistic set of cues, a loop, track color, and bpm lock', () => {
    const entries: Markers2Entry[] = [
      { kind: 'cue', index: 0, positionMs: 0, color: [204, 0, 0], name: 'Intro' },
      { kind: 'cue', index: 1, positionMs: 15912, color: [0, 204, 0], name: 'Drop' },
      { kind: 'cue', index: 2, positionMs: 64123, color: [0, 0, 204], name: '' },
      {
        kind: 'loop',
        index: 0,
        startPositionMs: 32000,
        endPositionMs: 40000,
        locked: true,
        name: 'Main Loop',
        reservedMiddle: Buffer.from([0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0])
      },
      { kind: 'color', color: [128, 64, 32] },
      { kind: 'bpmLock', locked: true }
    ]

    const serialized = serializeMarkers2(entries)
    const parsed = parseMarkers2(serialized)

    expect(parsed).toEqual(entries)
  })

  it('round-trips unicode cue names', () => {
    const entries: Markers2Entry[] = [
      { kind: 'cue', index: 0, positionMs: 1000, color: [255, 255, 255], name: 'Bréak 🔥 東京' }
    ]
    const parsed = parseMarkers2(serializeMarkers2(entries))
    expect((parsed[0] as CueEntry).name).toBe('Bréak 🔥 東京')
  })

  it('preserves unknown/future entry types verbatim', () => {
    const entries: Markers2Entry[] = [
      { kind: 'cue', index: 0, positionMs: 0, color: [1, 2, 3], name: 'A' },
      { kind: 'unknown', typeName: 'FLIP', raw: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]) }
    ]
    const roundTripped = parseMarkers2(serializeMarkers2(entries))
    expect(roundTripped).toEqual(entries)
  })

  it('getCues/getLoops filter correctly and withCues replaces only cues', () => {
    const entries: Markers2Entry[] = [
      { kind: 'cue', index: 0, positionMs: 0, color: [1, 1, 1], name: 'A' },
      {
        kind: 'loop',
        index: 0,
        startPositionMs: 0,
        endPositionMs: 1000,
        locked: false,
        name: 'L',
        reservedMiddle: Buffer.alloc(9)
      },
      { kind: 'bpmLock', locked: false }
    ]
    expect(getCues(entries)).toHaveLength(1)
    expect(getLoops(entries)).toHaveLength(1)

    const newCues: CueEntry[] = [
      { kind: 'cue', index: 0, positionMs: 5000, color: [9, 9, 9], name: 'New' }
    ]
    const replaced = withCues(entries, newCues)
    expect(getCues(replaced)).toEqual(newCues)
    expect(getLoops(replaced)).toHaveLength(1)
    expect(replaced.some((e) => e.kind === 'bpmLock')).toBe(true)
  })

  it('rejects an unsupported major version instead of silently misparsing', () => {
    const bogus = Buffer.from(
      Buffer.concat([Buffer.from([2, 0]), Buffer.from('CUE\0')]).toString('base64'),
      'ascii'
    )
    expect(() => parseMarkers2(bogus)).toThrow(/Unsupported/)
  })

  it('handles zero entries (blank Markers2 tag)', () => {
    expect(parseMarkers2(serializeMarkers2([]))).toEqual([])
  })
})
