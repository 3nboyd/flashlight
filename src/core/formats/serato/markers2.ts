import { BinaryReader } from '@core/binary/BinaryReader'
import { BinaryWriter } from '@core/binary/BinaryWriter'

/**
 * Parses/serializes the decoded content of the "Serato Markers2" tag —
 * hotcues, loops, track color and BPM-lock, embedded directly in the audio
 * file (GEOB frame for MP3, Vorbis comment for FLAC, custom atom for
 * MP4/M4A). The GEOB/atom/comment *envelope* is handled elsewhere; this
 * module only deals with the envelope's payload, which for Markers2 is
 * ASCII base64 text of: [0x01, 0x01] + a sequence of
 * [null-terminated type name][4-byte BE length][payload] entries.
 *
 * Byte layouts below come from the community reverse-engineering effort at
 * github.com/Holzhaus/serato-tags. Entry types we don't explicitly model
 * (e.g. a future Serato version's new entry kind) are kept as `unknown`
 * entries carrying their raw bytes, so they always round-trip untouched.
 */

export interface CueEntry {
  kind: 'cue'
  index: number
  positionMs: number
  color: [number, number, number]
  name: string
}

export interface LoopEntry {
  kind: 'loop'
  index: number
  startPositionMs: number
  endPositionMs: number
  locked: boolean
  name: string
  /** Middle bytes (loop color / reserved flags) whose exact semantics are
   *  unconfirmed — preserved verbatim rather than reinterpreted. */
  reservedMiddle: Buffer
}

export interface ColorEntry {
  kind: 'color'
  color: [number, number, number]
}

export interface BpmLockEntry {
  kind: 'bpmLock'
  locked: boolean
}

export interface UnknownEntry {
  kind: 'unknown'
  typeName: string
  raw: Buffer
}

export type Markers2Entry = CueEntry | LoopEntry | ColorEntry | BpmLockEntry | UnknownEntry

function parseEntryPayload(typeName: string, payload: Buffer): Markers2Entry {
  const reader = new BinaryReader(payload)
  try {
    switch (typeName) {
      case 'CUE': {
        reader.readUInt8() // field1, reserved
        const index = reader.readUInt8()
        const positionMs = reader.readUInt32BE()
        reader.readUInt8() // field4, reserved
        const r = reader.readUInt8()
        const g = reader.readUInt8()
        const b = reader.readUInt8()
        reader.readUInt16BE() // field6, reserved
        const name = reader.readUtf8CString()
        return { kind: 'cue', index, positionMs, color: [r, g, b], name }
      }
      case 'LOOP': {
        reader.readUInt8() // field1, reserved
        const index = reader.readUInt8()
        const startPositionMs = reader.readUInt32BE()
        const endPositionMs = reader.readUInt32BE()
        const reservedMiddle = reader.readBytes(9) // 4s + 4s + B, semantics unconfirmed
        const locked = reader.readBool()
        const name = reader.readUtf8CString()
        return {
          kind: 'loop',
          index,
          startPositionMs,
          endPositionMs,
          locked,
          name,
          reservedMiddle: Buffer.from(reservedMiddle)
        }
      }
      case 'COLOR': {
        reader.readUInt8() // reserved
        const r = reader.readUInt8()
        const g = reader.readUInt8()
        const b = reader.readUInt8()
        return { kind: 'color', color: [r, g, b] }
      }
      case 'BPMLOCK': {
        const locked = reader.readBool()
        return { kind: 'bpmLock', locked }
      }
      default:
        return { kind: 'unknown', typeName, raw: payload }
    }
  } catch {
    // Payload didn't match our assumed layout for this type — preserve raw
    // rather than risk emitting a malformed entry.
    return { kind: 'unknown', typeName, raw: payload }
  }
}

function encodeEntryPayload(
  entry: CueEntry | LoopEntry | ColorEntry | BpmLockEntry
): { typeName: string; payload: Buffer } {
  switch (entry.kind) {
    case 'cue': {
      const w = new BinaryWriter()
      w.writeUInt8(0)
        .writeUInt8(entry.index)
        .writeUInt32BE(entry.positionMs)
        .writeUInt8(0)
        .writeUInt8(entry.color[0])
        .writeUInt8(entry.color[1])
        .writeUInt8(entry.color[2])
        .writeUInt16BE(0)
        .writeUtf8CString(entry.name)
      return { typeName: 'CUE', payload: w.toBuffer() }
    }
    case 'loop': {
      const w = new BinaryWriter()
      w.writeUInt8(0)
        .writeUInt8(entry.index)
        .writeUInt32BE(entry.startPositionMs)
        .writeUInt32BE(entry.endPositionMs)
        .writeBytes(entry.reservedMiddle)
        .writeBool(entry.locked)
        .writeUtf8CString(entry.name)
      return { typeName: 'LOOP', payload: w.toBuffer() }
    }
    case 'color': {
      const w = new BinaryWriter()
        .writeUInt8(0)
        .writeUInt8(entry.color[0])
        .writeUInt8(entry.color[1])
        .writeUInt8(entry.color[2])
      return { typeName: 'COLOR', payload: w.toBuffer() }
    }
    case 'bpmLock': {
      const w = new BinaryWriter().writeBool(entry.locked)
      return { typeName: 'BPMLOCK', payload: w.toBuffer() }
    }
  }
}

/** Parses the base64-encoded Markers2 GEOB object data (envelope already stripped). */
export function parseMarkers2(base64Data: Buffer | string): Markers2Entry[] {
  const decoded = Buffer.from(
    typeof base64Data === 'string' ? base64Data : base64Data.toString('ascii'),
    'base64'
  )
  const reader = new BinaryReader(decoded)
  const versionMajor = reader.readUInt8()
  const versionMinor = reader.readUInt8()
  if (versionMajor !== 1) {
    throw new Error(`Unsupported Serato Markers2 version: ${versionMajor}.${versionMinor}`)
  }

  const entries: Markers2Entry[] = []
  while (reader.remaining > 4) {
    const typeName = reader.readCString('ascii')
    if (typeName === '') break
    const length = reader.readUInt32BE()
    const payload = reader.readBytes(length)
    entries.push(parseEntryPayload(typeName, Buffer.from(payload)))
  }
  return entries
}

/** Serializes entries back to base64-encoded Markers2 GEOB object data. */
export function serializeMarkers2(entries: Markers2Entry[]): Buffer {
  const w = new BinaryWriter()
  w.writeUInt8(1).writeUInt8(1)
  for (const entry of entries) {
    if (entry.kind === 'unknown') {
      w.writeCString(entry.typeName, 'ascii').writeUInt32BE(entry.raw.length).writeBytes(entry.raw)
      continue
    }
    const { typeName, payload } = encodeEntryPayload(entry)
    w.writeCString(typeName, 'ascii').writeUInt32BE(payload.length).writeBytes(payload)
  }
  const binary = w.toBuffer()
  return Buffer.from(binary.toString('base64'), 'ascii')
}

export function getCues(entries: Markers2Entry[]): CueEntry[] {
  return entries.filter((e): e is CueEntry => e.kind === 'cue')
}

export function getLoops(entries: Markers2Entry[]): LoopEntry[] {
  return entries.filter((e): e is LoopEntry => e.kind === 'loop')
}

/** Replaces all cue entries (by hotcue index) while leaving loops/color/unknown entries untouched. */
export function withCues(entries: Markers2Entry[], cues: CueEntry[]): Markers2Entry[] {
  const nonCues = entries.filter((e) => e.kind !== 'cue')
  return [...nonCues, ...cues]
}

export function withLoops(entries: Markers2Entry[], loops: LoopEntry[]): Markers2Entry[] {
  const nonLoops = entries.filter((e) => e.kind !== 'loop')
  return [...nonLoops, ...loops]
}
