import type { UnifiedCue, UnifiedLoop } from './Track'
import { getCues, getLoops, type CueEntry, type LoopEntry, type Markers2Entry } from '../formats/serato/markers2'
import type { VdjCue } from '../formats/virtualdj/VirtualDjDatabase'
import type { RekordboxCue, RekordboxLoop } from '../formats/rekordbox/RekordboxExport'

/** Serato cue/loop indices and units (ms) map 1:1 onto the unified model. */
export function fromSeratoEntries(entries: Markers2Entry[]): {
  cues: UnifiedCue[]
  loops: UnifiedLoop[]
} {
  return {
    cues: getCues(entries).map((c) => ({
      index: c.index,
      positionMs: c.positionMs,
      name: c.name || undefined,
      color: c.color
    })),
    loops: getLoops(entries).map((l) => ({
      index: l.index,
      startMs: l.startPositionMs,
      endMs: l.endPositionMs,
      name: l.name || undefined
    }))
  }
}

export function toSeratoCueEntries(cues: UnifiedCue[]): CueEntry[] {
  return cues.map((c) => ({
    kind: 'cue',
    index: c.index,
    positionMs: Math.round(c.positionMs),
    color: c.color ?? [0xcc, 0x00, 0x00],
    name: c.name ?? ''
  }))
}

export function toSeratoLoopEntries(loops: UnifiedLoop[]): LoopEntry[] {
  return loops.map((l) => ({
    kind: 'loop',
    index: l.index,
    startPositionMs: Math.round(l.startMs),
    endPositionMs: Math.round(l.endMs),
    locked: false,
    name: l.name ?? '',
    reservedMiddle: Buffer.from([0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0])
  }))
}

/**
 * VirtualDJ hotcue Poi `Num` is 1-based (Num="1" is the first hotcue) and
 * positions are decimal seconds, vs. the unified model's 0-based index and
 * millisecond positions.
 */
export function fromVdjCues(cues: VdjCue[]): UnifiedCue[] {
  return cues.map((c) => ({
    index: c.num - 1,
    positionMs: Math.round(c.positionSeconds * 1000),
    name: c.name
  }))
}

export function toVdjCues(cues: UnifiedCue[]): VdjCue[] {
  return cues.map((c) => ({
    num: c.index + 1,
    positionSeconds: c.positionMs / 1000,
    name: c.name
  }))
}

/** Rekordbox hot cue `Num` is 0-based (A=0, B=1, ...), matching the unified model directly. */
export function toRekordboxCues(cues: UnifiedCue[]): RekordboxCue[] {
  return cues.map((c) => ({
    num: c.index,
    positionSeconds: c.positionMs / 1000,
    name: c.name
  }))
}

export function toRekordboxLoops(loops: UnifiedLoop[]): RekordboxLoop[] {
  return loops.map((l) => ({
    num: l.index,
    startSeconds: l.startMs / 1000,
    endSeconds: l.endMs / 1000,
    name: l.name
  }))
}
