import { parseRecords, serializeRecords, makeContainerRecord, makeTextRecord, getTextValue, findChild, type SeratoRecord } from './records'

const CRATE_VERSION = '1.0/Serato ScratchLive Crate'

/**
 * Parses/serializes a single Serato `.crate` file (Subcrates/<Name>.crate).
 * Nested crates are represented by '%%' in the filename (e.g.
 * "Techno%%Peak Time.crate" is the "Peak Time" sub-crate of "Techno") —
 * that's a filesystem naming convention, not something encoded in the file
 * content, so it's handled by callers working with paths, not here.
 */
export class SeratoCrate {
  private constructor(private records: SeratoRecord[]) {}

  static parse(buf: Buffer): SeratoCrate {
    return new SeratoCrate(parseRecords(buf));
  }

  static createEmpty(): SeratoCrate {
    return new SeratoCrate([makeTextRecord('vrsn', CRATE_VERSION)])
  }

  serialize(): Buffer {
    return serializeRecords(this.records)
  }

  listTrackPaths(): string[] {
    return this.records
      .filter((r) => r.tag === 'otrk')
      .map((r) => getTextValue(findChild(r, 'ptrk')))
      .filter((p): p is string => p !== undefined)
  }

  hasTrack(path: string): boolean {
    return this.listTrackPaths().includes(path)
  }

  addTrack(path: string): void {
    if (this.hasTrack(path)) return
    this.records.push(makeContainerRecord('otrk', [makeTextRecord('ptrk', path)]))
  }

  removeTrack(path: string): boolean {
    const before = this.records.length
    this.records = this.records.filter((r) => {
      if (r.tag !== 'otrk') return true
      return getTextValue(findChild(r, 'ptrk')) !== path
    })
    return this.records.length !== before
  }

  renameTrackPath(oldPath: string, newPath: string): boolean {
    let updated = false
    this.records = this.records.map((record) => {
      if (record.tag !== 'otrk' || record.decoded.kind !== 'container') return record
      const pathField = findChild(record, 'ptrk')
      if (getTextValue(pathField) !== oldPath) return record
      const children = record.decoded.children.map((child) =>
        child.tag === 'ptrk' ? { ...child, decoded: { kind: 'text' as const, value: newPath }, dirty: true } : child
      )
      updated = true
      return { ...record, decoded: { kind: 'container', children }, dirty: true }
    })
    return updated
  }
}
