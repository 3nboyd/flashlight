import { describe, it, expect } from 'vitest'
import {
  fromSeratoEntries,
  toSeratoCueEntries,
  toSeratoLoopEntries,
  fromVdjCues,
  toVdjCues,
  toRekordboxCues,
  toRekordboxLoops
} from './cueMapping'
import type { Markers2Entry } from '../formats/serato/markers2'
import type { UnifiedCue, UnifiedLoop } from './Track'

describe('Serato <-> unified mapping', () => {
  it('extracts cues and loops, leaving color/bpmLock/unknown out', () => {
    const entries: Markers2Entry[] = [
      { kind: 'cue', index: 0, positionMs: 1000, color: [255, 0, 0], name: 'Intro' },
      {
        kind: 'loop',
        index: 0,
        startPositionMs: 2000,
        endPositionMs: 3000,
        locked: false,
        name: 'Loop',
        reservedMiddle: Buffer.alloc(9)
      },
      { kind: 'color', color: [1, 2, 3] },
      { kind: 'bpmLock', locked: true }
    ]
    const { cues, loops } = fromSeratoEntries(entries)
    expect(cues).toEqual([{ index: 0, positionMs: 1000, name: 'Intro', color: [255, 0, 0] }])
    expect(loops).toEqual([{ index: 0, startMs: 2000, endMs: 3000, name: 'Loop' }])
  })

  it('round-trips unified cues through Serato entry conversion (0-based index, ms unchanged)', () => {
    const cues: UnifiedCue[] = [
      { index: 0, positionMs: 1500, name: 'A', color: [10, 20, 30] },
      { index: 1, positionMs: 9999, name: 'B' }
    ]
    const seratoEntries = toSeratoCueEntries(cues)
    expect(seratoEntries[0]).toMatchObject({ index: 0, positionMs: 1500 })
    const { cues: roundTripped } = fromSeratoEntries(seratoEntries)
    expect(roundTripped[0]).toMatchObject({ index: 0, positionMs: 1500, name: 'A' })
    expect(roundTripped[1]).toMatchObject({ index: 1, positionMs: 9999, name: 'B' })
  })

  it('round-trips unified loops through Serato entry conversion', () => {
    const loops: UnifiedLoop[] = [{ index: 0, startMs: 5000, endMs: 8000, name: 'Build' }]
    const { loops: roundTripped } = fromSeratoEntries(toSeratoLoopEntries(loops))
    expect(roundTripped).toEqual(loops)
  })
})

describe('VirtualDJ <-> unified mapping (1-based Num, seconds)', () => {
  it('converts VDJ 1-based Num and seconds down to unified 0-based ms', () => {
    const unified = fromVdjCues([
      { num: 1, positionSeconds: 15.912449, name: 'Cue 1' },
      { num: 4, positionSeconds: 60.0, name: 'Cue 4' }
    ])
    expect(unified).toEqual([
      { index: 0, positionMs: 15912, name: 'Cue 1' },
      { index: 3, positionMs: 60000, name: 'Cue 4' }
    ])
  })

  it('converts unified 0-based ms back up to VDJ 1-based seconds', () => {
    const vdj = toVdjCues([{ index: 0, positionMs: 15912, name: 'Cue 1' }])
    expect(vdj).toEqual([{ num: 1, positionSeconds: 15.912, name: 'Cue 1' }])
  })

  it('round-trips through both directions without drifting the index', () => {
    const original: UnifiedCue[] = [
      { index: 0, positionMs: 1000 },
      { index: 7, positionMs: 250000 }
    ]
    const roundTripped = fromVdjCues(toVdjCues(original))
    expect(roundTripped.map((c) => c.index)).toEqual([0, 7])
  })
})

describe('rekordbox <-> unified mapping (0-based Num, seconds)', () => {
  it('keeps 0-based index unchanged and converts ms to seconds for cues', () => {
    const cues = toRekordboxCues([{ index: 0, positionMs: 15912, name: 'Intro' }])
    expect(cues).toEqual([{ num: 0, positionSeconds: 15.912, name: 'Intro' }])
  })

  it('converts loop start/end ms to seconds', () => {
    const loops = toRekordboxLoops([{ index: 2, startMs: 32000, endMs: 40000, name: 'Build' }])
    expect(loops).toEqual([{ num: 2, startSeconds: 32, endSeconds: 40, name: 'Build' }])
  })
})
