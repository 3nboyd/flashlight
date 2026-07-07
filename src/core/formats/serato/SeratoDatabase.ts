import {
  parseRecords,
  serializeRecords,
  setTextValue,
  findChild,
  getTextValue,
  type SeratoRecord
} from './records'

export interface SeratoTrackEntry {
  /** Index into the top-level record list, so callers can address this exact otrk. */
  index: number
  path: string
  record: SeratoRecord
}

/**
 * Parses/serializes Serato's `database V2` file: a flat list of top-level
 * records (version header + one `otrk` container per track). We only need
 * to interpret enough of it to enumerate tracks by path and rewrite paths
 * when the user moves files via the app's file explorer — every other
 * field on each otrk is preserved untouched via records.ts's raw fallback.
 */
export class SeratoDatabase {
  private constructor(private records: SeratoRecord[]) {}

  static parse(buf: Buffer): SeratoDatabase {
    return new SeratoDatabase(parseRecords(buf))
  }

  serialize(): Buffer {
    return serializeRecords(this.records)
  }

  listTracks(): SeratoTrackEntry[] {
    const tracks: SeratoTrackEntry[] = []
    this.records.forEach((record, index) => {
      if (record.tag !== 'otrk') return
      const pathField = findChild(record, 'pfil') ?? findChild(record, 'ptrk')
      const path = getTextValue(pathField)
      if (path !== undefined) tracks.push({ index, path, record })
    })
    return tracks
  }

  /**
   * Rewrites the file path stored for a track after a move/rename. Returns
   * true if a matching track was found and updated, false otherwise (the
   * caller should treat "not found" as a no-op, not an error, since the
   * user's file explorer operations may touch files outside Serato's view).
   */
  updateTrackPath(oldPath: string, newPath: string): boolean {
    let updated = false
    this.records = this.records.map((record) => {
      if (record.tag !== 'otrk' || record.decoded.kind !== 'container') return record
      const pathTag = findChild(record, 'pfil') ? 'pfil' : 'ptrk'
      const pathField = findChild(record, pathTag)
      if (getTextValue(pathField) !== oldPath) return record

      const children = record.decoded.children.map((child) =>
        child.tag === pathTag ? setTextValue(child, newPath) : child
      )
      updated = true
      return { ...record, decoded: { kind: 'container', children }, dirty: true }
    })
    return updated
  }

  findByPath(path: string): SeratoTrackEntry | undefined {
    return this.listTracks().find((t) => t.path === path)
  }
}
