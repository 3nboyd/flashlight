import { BinaryReader } from '@core/binary/BinaryReader'
import { BinaryWriter } from '@core/binary/BinaryWriter'

/**
 * Serato's database V2 and .crate files are both a flat/nested sequence of
 * TLV records: 4-byte ASCII tag + 4-byte BE length + payload. The payload's
 * interpretation is inferred from the tag's leading character (a convention
 * reverse-engineered by the Mixxx project), with 'vrsn' as a special case.
 *
 * We decode every record into a typed value when we recognize the shape,
 * but ALWAYS retain the original raw bytes too. Serialization prefers a
 * value we've explicitly modified, otherwise re-emits the original raw
 * bytes verbatim — so any tag we don't fully understand still round-trips
 * byte-for-byte instead of risking corruption.
 */

export type SeratoRecordValue =
  | { kind: 'container'; children: SeratoRecord[] }
  | { kind: 'text'; value: string }
  | { kind: 'uint32'; value: number }
  | { kind: 'uint16'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'raw' }

export interface SeratoRecord {
  tag: string
  raw: Buffer
  decoded: SeratoRecordValue
  /** Present only when a field's decoded value has been explicitly edited. */
  dirty?: boolean
}

function decodePayload(tag: string, payload: Buffer): SeratoRecordValue {
  const type = tag === 'vrsn' ? 't' : tag[0]
  try {
    switch (type) {
      case 'o':
        return { kind: 'container', children: parseRecords(payload) }
      case 't':
      case 'p': {
        const reader = new BinaryReader(payload)
        return { kind: 'text', value: reader.readUtf16BEString(payload.length) }
      }
      case 'u':
        if (payload.length !== 4) return { kind: 'raw' }
        return { kind: 'uint32', value: payload.readUInt32BE(0) }
      case 's':
        if (payload.length !== 2) return { kind: 'raw' }
        return { kind: 'uint16', value: payload.readUInt16BE(0) }
      case 'b':
        if (payload.length !== 1) return { kind: 'raw' }
        return { kind: 'bool', value: payload[0] !== 0 }
      default:
        return { kind: 'raw' }
    }
  } catch {
    return { kind: 'raw' }
  }
}

export function parseRecords(buf: Buffer): SeratoRecord[] {
  const reader = new BinaryReader(buf)
  const records: SeratoRecord[] = []
  while (!reader.eof()) {
    if (reader.remaining < 8) break
    const tag = reader.readTag4()
    const length = reader.readUInt32BE()
    const raw = reader.readBytes(length)
    records.push({ tag, raw: Buffer.from(raw), decoded: decodePayload(tag, Buffer.from(raw)) })
  }
  return records
}

function encodeValue(record: SeratoRecord): Buffer {
  if (!record.dirty) return record.raw

  const { decoded } = record
  switch (decoded.kind) {
    case 'container':
      return serializeRecords(decoded.children)
    case 'text': {
      const w = new BinaryWriter()
      w.writeUtf16BEString(decoded.value, false)
      return w.toBuffer()
    }
    case 'uint32': {
      const w = new BinaryWriter().writeUInt32BE(decoded.value)
      return w.toBuffer()
    }
    case 'uint16': {
      const w = new BinaryWriter().writeUInt16BE(decoded.value)
      return w.toBuffer()
    }
    case 'bool':
      return new BinaryWriter().writeUInt8(decoded.value ? 1 : 0).toBuffer()
    case 'raw':
      return record.raw
  }
}

export function serializeRecords(records: SeratoRecord[]): Buffer {
  const writer = new BinaryWriter()
  for (const record of records) {
    const payload = encodeValue(record)
    writer.writeTag4(record.tag).writeUInt32BE(payload.length).writeBytes(payload)
  }
  return writer.toBuffer()
}

export function makeTextRecord(tag: string, value: string): SeratoRecord {
  const w = new BinaryWriter()
  w.writeUtf16BEString(value, false)
  const raw = w.toBuffer()
  return { tag, raw, decoded: { kind: 'text', value } }
}

export function makeContainerRecord(tag: string, children: SeratoRecord[]): SeratoRecord {
  return { tag, raw: serializeRecords(children), decoded: { kind: 'container', children } }
}

export function setTextValue(record: SeratoRecord, value: string): SeratoRecord {
  return { ...record, decoded: { kind: 'text', value }, dirty: true }
}

export function findChild(record: SeratoRecord, tag: string): SeratoRecord | undefined {
  if (record.decoded.kind !== 'container') return undefined
  return record.decoded.children.find((c) => c.tag === tag)
}

export function getTextValue(record: SeratoRecord | undefined): string | undefined {
  if (!record || record.decoded.kind !== 'text') return undefined
  return record.decoded.value
}
