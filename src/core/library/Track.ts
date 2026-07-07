/**
 * The app's platform-agnostic track model. Cue/loop positions are stored in
 * milliseconds (Serato's native precision) and hotcue/loop `index` is
 * always 0-based — format-specific writers/readers translate to each
 * platform's own numbering and units at the boundary (see cueMapping.ts).
 */

export interface UnifiedCue {
  index: number
  positionMs: number
  name?: string
  color?: [number, number, number]
}

export interface UnifiedLoop {
  index: number
  startMs: number
  endMs: number
  name?: string
}

export interface TrackMetadata {
  title?: string
  artist?: string
  album?: string
  genre?: string
  year?: number
  durationSeconds?: number
  bitrateKbps?: number
  sampleRateHz?: number
  bpm?: number
  key?: string
  comment?: string
}

export type AudioFormat = 'mp3' | 'flac' | 'wav' | 'aiff' | 'm4a' | 'other'

export interface TrackSources {
  serato: boolean
  virtualDj: boolean
  rekordboxExported: boolean
}

export interface LibraryTrack {
  filePath: string
  sizeBytes: number
  format: AudioFormat
  metadata: TrackMetadata
  cues: UnifiedCue[]
  loops: UnifiedLoop[]
  sources: TrackSources
}

export function detectAudioFormat(filePath: string): AudioFormat {
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'mp3':
      return 'mp3'
    case 'flac':
      return 'flac'
    case 'wav':
      return 'wav'
    case 'aiff':
    case 'aif':
      return 'aiff'
    case 'm4a':
    case 'mp4':
      return 'm4a'
    default:
      return 'other'
  }
}
