import { BinaryReader } from '@core/binary/BinaryReader'
import { BinaryWriter } from '@core/binary/BinaryWriter'

/**
 * Parses/serializes the "Serato BeatGrid" GEOB tag content (raw binary, NOT
 * base64 — unlike Markers2). Structure per community reverse-engineering:
 * a 2-byte version header, a BE uint32 marker count, that many markers, and
 * a 1-byte footer.
 *
 * CONFIDENCE NOTE: this layout is less independently verified than
 * markers2.ts's. It round-trips correctly against our own synthetic
 * fixtures but has not been validated against a real Serato-written file.
 * Treat beatgrid writes as best-effort — everything else in this app
 * degrades gracefully (hotcues/loops are unaffected) if a beatgrid write
 * is skipped, and every write is backed up first regardless.
 */

export interface NonTerminalMarker {
  terminal: false
  positionSeconds: number
  beatsTillNextMarker: number
}

export interface TerminalMarker {
  terminal: true
  positionSeconds: number
  bpm: number
}

export type BeatGridMarker = NonTerminalMarker | TerminalMarker

export interface BeatGrid {
  markers: BeatGridMarker[]
  footer: Buffer
}

export function parseBeatGrid(data: Buffer): BeatGrid {
  const reader = new BinaryReader(data)
  reader.readUInt8() // version major
  reader.readUInt8() // version minor
  const count = reader.readUInt32BE()

  const markers: BeatGridMarker[] = []
  for (let i = 0; i < count; i++) {
    const positionSeconds = reader.readFloatBE()
    const isLast = i === count - 1
    if (isLast) {
      const bpm = reader.readFloatBE()
      markers.push({ terminal: true, positionSeconds, bpm })
    } else {
      const beatsTillNextMarker = reader.readUInt32BE()
      markers.push({ terminal: false, positionSeconds, beatsTillNextMarker })
    }
  }

  const footer = reader.remaining > 0 ? reader.readBytes(reader.remaining) : Buffer.alloc(0)
  return { markers, footer: Buffer.from(footer) }
}

export function serializeBeatGrid(grid: BeatGrid): Buffer {
  const w = new BinaryWriter()
  w.writeUInt8(1).writeUInt8(0).writeUInt32BE(grid.markers.length)
  for (const marker of grid.markers) {
    w.writeFloatBE(marker.positionSeconds)
    if (marker.terminal) {
      w.writeFloatBE(marker.bpm)
    } else {
      w.writeUInt32BE(marker.beatsTillNextMarker)
    }
  }
  w.writeBytes(grid.footer)
  return w.toBuffer()
}
