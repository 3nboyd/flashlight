import { parseAttrs, parseChildren, formatAttrs, escapeXml, type XmlAttrs, type XmlChildElement } from './xmlUtil'

/**
 * Reads/writes VirtualDJ's database.xml. Song blocks we don't touch are
 * preserved as an exact substring of the original file (including
 * whitespace between entries); only Song blocks we explicitly modify are
 * regenerated, using VirtualDJ's required one-space/two-space indentation
 * convention — a generic XML pretty-printer's output is rejected by VDJ as
 * a corrupted database.
 */

export interface VdjSong {
  attrs: XmlAttrs
  children: XmlChildElement[]
  originalText: string
  dirty: boolean
}

type Segment = { type: 'raw'; text: string } | { type: 'song'; song: VdjSong }

const SONG_BLOCK_PATTERN = /<Song\b([^>]*)>([\s\S]*?)<\/Song\s*>/g

export interface VdjCue {
  num: number
  positionSeconds: number
  name?: string
}

function isHotcuePoi(attrs: XmlAttrs): boolean {
  return attrs.Num !== undefined && attrs.Type === undefined
}

/**
 * Note: this deliberately does NOT prefix the opening `<Song>` line with its
 * one-space indent — that indent is part of the original file's raw
 * whitespace between entries, which the caller preserves untouched and
 * splices this block directly after.
 */
function formatSongBlock(song: VdjSong): string {
  const lines = [`<Song ${formatAttrs(song.attrs)}>`]
  for (const child of song.children) {
    const attrString = formatAttrs(child.attrs)
    if (child.text !== undefined) {
      lines.push(`  <${child.tag}${attrString ? ' ' + attrString : ''}>${escapeXml(child.text)}</${child.tag}>`)
    } else {
      lines.push(`  <${child.tag}${attrString ? ' ' + attrString : ''} />`)
    }
  }
  lines.push(' </Song>')
  return lines.join('\n')
}

export class VirtualDjDatabase {
  private constructor(private segments: Segment[]) {}

  static parse(xmlText: string): VirtualDjDatabase {
    const segments: Segment[] = []
    let lastIndex = 0
    for (const match of xmlText.matchAll(SONG_BLOCK_PATTERN)) {
      segments.push({ type: 'raw', text: xmlText.slice(lastIndex, match.index) })
      segments.push({
        type: 'song',
        song: {
          attrs: parseAttrs(match[1]),
          children: parseChildren(match[2]),
          originalText: match[0],
          dirty: false
        }
      })
      lastIndex = match.index! + match[0].length
    }
    segments.push({ type: 'raw', text: xmlText.slice(lastIndex) })
    return new VirtualDjDatabase(segments)
  }

  serialize(): string {
    return this.segments
      .map((seg) =>
        seg.type === 'raw' ? seg.text : seg.song.dirty ? formatSongBlock(seg.song) : seg.song.originalText
      )
      .join('')
  }

  private songSegments(): { song: VdjSong; index: number }[] {
    return this.segments
      .map((seg, index) => (seg.type === 'song' ? { song: seg.song, index } : null))
      .filter((x): x is { song: VdjSong; index: number } => x !== null)
  }

  listSongs(): VdjSong[] {
    return this.songSegments().map((s) => s.song)
  }

  findByPath(filePath: string): VdjSong | undefined {
    return this.listSongs().find((s) => s.attrs.FilePath === filePath)
  }

  updateFilePath(oldPath: string, newPath: string): boolean {
    const match = this.songSegments().find((s) => s.song.attrs.FilePath === oldPath)
    if (!match) return false
    match.song.attrs = { ...match.song.attrs, FilePath: newPath }
    match.song.dirty = true
    return true
  }

  getHotcues(filePath: string): VdjCue[] {
    const song = this.findByPath(filePath)
    if (!song) return []
    return song.children
      .filter((c) => c.tag === 'Poi' && isHotcuePoi(c.attrs))
      .map((c) => ({
        num: Number(c.attrs.Num),
        positionSeconds: Number(c.attrs.Pos),
        name: c.attrs.Name
      }))
      .sort((a, b) => a.num - b.num)
  }

  /** Replaces only hotcue Poi entries (Num set, no Type) — beatgrid/automix Poi entries are left untouched. */
  setHotcues(filePath: string, cues: VdjCue[]): boolean {
    const match = this.songSegments().find((s) => s.song.attrs.FilePath === filePath)
    if (!match) return false

    const nonHotcueChildren = match.song.children.filter(
      (c) => !(c.tag === 'Poi' && isHotcuePoi(c.attrs))
    )
    const newPoiChildren: XmlChildElement[] = cues.map((cue) => ({
      tag: 'Poi',
      attrs: {
        ...(cue.name ? { Name: cue.name } : {}),
        Pos: cue.positionSeconds.toFixed(6),
        Num: String(cue.num)
      }
    }))

    match.song.children = [...nonHotcueChildren, ...newPoiChildren]
    match.song.dirty = true
    return true
  }
}
