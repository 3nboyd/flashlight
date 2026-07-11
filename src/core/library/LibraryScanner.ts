import { promises as fs } from 'fs'
import { join } from 'path'
import { detectAudioFormat, type LibraryTrack } from './Track'
import { readSeratoTags } from '../formats/serato/SeratoTagIO'
import { fromSeratoEntries } from './cueMapping'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.aiff', '.aif', '.m4a', '.mp4'])

async function findAudioFiles(rootDir: string): Promise<string[]> {
  const results: string[] = []
  const entries = await fs.readdir(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await findAudioFiles(fullPath)))
    } else if (AUDIO_EXTENSIONS.has(fullPath.slice(fullPath.lastIndexOf('.')).toLowerCase())) {
      results.push(fullPath)
    }
  }
  return results
}

/**
 * music-metadata ships ESM-only, and our Electron main process is bundled
 * as CJS. A static `import` gets mis-interopped by esbuild/Node into an
 * object without `parseFile` at the top level; a dynamic `import()` goes
 * through Node's real ESM loader and resolves correctly. The dynamic
 * import is cached by Node after the first call, so this has no meaningful
 * per-file cost.
 */
async function loadMusicMetadata(): Promise<typeof import('music-metadata')> {
  return import('music-metadata')
}

export interface ScanError {
  filePath: string
  message: string
}

export interface ScanResult {
  tracks: LibraryTrack[]
  errors: ScanError[]
}

/**
 * Reads standard tag metadata for every audio file under a folder (any
 * supported format), and additionally reads embedded Serato hotcues/loops
 * for MP3 files. FLAC/M4A Serato cue reading is not yet implemented (see
 * README roadmap) - those files still get full standard-metadata scanning.
 */
export async function scanLibraryFolder(rootDir: string): Promise<ScanResult> {
  const files = await findAudioFiles(rootDir)
  const tracks: LibraryTrack[] = []
  const errors: ScanError[] = []

  for (const filePath of files) {
    try {
      tracks.push(await scanTrack(filePath))
    } catch (err) {
      errors.push({ filePath, message: err instanceof Error ? err.message : String(err) })
    }
  }

  return { tracks, errors }
}

export async function scanTrack(filePath: string): Promise<LibraryTrack> {
  const stat = await fs.stat(filePath)
  const format = detectAudioFormat(filePath)
  const musicMetadata = await loadMusicMetadata()
  const parsed = await musicMetadata.parseFile(filePath, { duration: true })

  const track: LibraryTrack = {
    filePath,
    sizeBytes: stat.size,
    format,
    metadata: {
      title: parsed.common.title,
      artist: parsed.common.artist,
      album: parsed.common.album,
      genre: parsed.common.genre?.[0],
      year: parsed.common.year,
      durationSeconds: parsed.format.duration,
      bitrateKbps: parsed.format.bitrate ? Math.round(parsed.format.bitrate / 1000) : undefined,
      sampleRateHz: parsed.format.sampleRate,
      bpm: parsed.common.bpm,
      key: parsed.common.key
    },
    cues: [],
    loops: [],
    sources: { serato: false, virtualDj: false, rekordboxExported: false }
  }

  if (format === 'mp3') {
    const seratoTags = readSeratoTags(filePath)
    if (seratoTags.markers2) {
      const { cues, loops } = fromSeratoEntries(seratoTags.markers2)
      track.cues = cues
      track.loops = loops
      track.sources.serato = true
    }
  }

  return track
}
