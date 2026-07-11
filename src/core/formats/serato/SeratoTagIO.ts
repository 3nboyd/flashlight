import NodeID3 from 'node-id3'
import { parseMarkers2, serializeMarkers2, type Markers2Entry } from './markers2'
import { parseBeatGrid, serializeBeatGrid, type BeatGrid } from './beatgrid'

const GEOB_MARKERS2 = 'Serato Markers2'
const GEOB_BEATGRID = 'Serato BeatGrid'

interface GeneralObjectFrame {
  mimeType?: string
  filename?: string
  contentDescription: string
  encapsulatedObject: Buffer
}

/**
 * Reads/writes Serato's GEOB-embedded tags on MP3 files via ID3v2.
 *
 * IMPORTANT: node-id3's own `update()` merges multi-instance frames (GEOB)
 * by an `updateCompareKey` that isn't configured for GEOB, so calling it
 * naively can silently overwrite the WRONG existing GEOB frame (e.g.
 * clobbering "Serato Autotags" while intending to update "Serato
 * Markers2"). We work around this by reading the full simplified tag set,
 * manually replacing only the matching-by-contentDescription GEOB entry,
 * and writing the full tag set back - every other frame (including
 * non-Serato GEOB frames, cover art, and standard metadata) passes through
 * untouched.
 *
 * FLAC (Vorbis comments) and MP4/M4A (custom atoms) are not yet supported
 * here - see README roadmap. Callers should check file extension first.
 */

export interface ParsedSeratoTags {
  markers2: Markers2Entry[] | null
  beatgrid: BeatGrid | null
}

function readGeneralObjects(filePath: string): GeneralObjectFrame[] {
  const tags = NodeID3.read(filePath)
  return (tags.generalObject as GeneralObjectFrame[] | undefined) ?? []
}

export function readSeratoTags(filePath: string): ParsedSeratoTags {
  const objects = readGeneralObjects(filePath)
  const markers2Frame = objects.find((o) => o.contentDescription === GEOB_MARKERS2)
  const beatgridFrame = objects.find((o) => o.contentDescription === GEOB_BEATGRID)

  return {
    markers2: markers2Frame ? parseMarkers2(markers2Frame.encapsulatedObject) : null,
    beatgrid: beatgridFrame ? parseBeatGrid(beatgridFrame.encapsulatedObject) : null
  }
}

function replaceGeneralObject(
  existing: GeneralObjectFrame[],
  contentDescription: string,
  encapsulatedObject: Buffer
): GeneralObjectFrame[] {
  const next = existing.filter((o) => o.contentDescription !== contentDescription)
  next.push({
    mimeType: 'application/octet-stream',
    filename: '',
    contentDescription,
    encapsulatedObject
  })
  return next
}

/**
 * Overwrites the Markers2 (hotcues/loops/color/bpm-lock) GEOB frame,
 * leaving every other frame in the file untouched. Callers are responsible
 * for backing up the file first (see BackupManager) - this function does
 * not snapshot on its own, so it can also be used for restores/tests.
 */
export function writeMarkers2Tags(filePath: string, entries: Markers2Entry[]): void {
  const currentTags = NodeID3.read(filePath)
  const existingObjects = (currentTags.generalObject as GeneralObjectFrame[] | undefined) ?? []
  const encapsulatedObject = serializeMarkers2(entries)
  const generalObject = replaceGeneralObject(existingObjects, GEOB_MARKERS2, encapsulatedObject)

  const result = NodeID3.write({ ...currentTags, generalObject }, filePath)
  if (result instanceof Error) throw result
}

export function writeBeatGridTags(filePath: string, grid: BeatGrid): void {
  const currentTags = NodeID3.read(filePath)
  const existingObjects = (currentTags.generalObject as GeneralObjectFrame[] | undefined) ?? []
  const encapsulatedObject = serializeBeatGrid(grid)
  const generalObject = replaceGeneralObject(existingObjects, GEOB_BEATGRID, encapsulatedObject)

  const result = NodeID3.write({ ...currentTags, generalObject }, filePath)
  if (result instanceof Error) throw result
}
