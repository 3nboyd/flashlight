import { escapeXml } from '../virtualdj/xmlUtil'
import { pathToFileUri } from './fileUri'

/**
 * Generates a rekordbox.xml - the standard bridge for getting hotcues/loops
 * onto a CDJ, since writing Pioneer's proprietary USB .pdb format directly
 * is still an unsolved problem even for the Mixxx project. The user imports
 * this file into rekordbox and syncs it to USB from there.
 *
 * This is a from-scratch export (not a surgical patch of an existing file
 * like the Serato/VirtualDJ writers), so a straightforward XML builder is
 * safe here - rekordbox re-imports and normalizes the file itself.
 */

export interface RekordboxCue {
  num: number
  positionSeconds: number
  name?: string
}

export interface RekordboxLoop {
  num: number
  startSeconds: number
  endSeconds: number
  name?: string
}

export interface RekordboxBeatgridPoint {
  positionSeconds: number
  bpm: number
  /** Time signature numerator, e.g. 4 for 4/4. Defaults to 4. */
  meterNumerator?: number
  meterDenominator?: number
}

export interface RekordboxTrackInput {
  id: number
  filePath: string
  name: string
  artist: string
  album?: string
  genre?: string
  composer?: string
  label?: string
  remixer?: string
  totalTimeSeconds?: number
  bitRateKbps?: number
  sampleRateHz?: number
  sizeBytes?: number
  year?: number
  averageBpm?: number
  tonality?: string
  comments?: string
  dateAdded?: string
  cues?: RekordboxCue[]
  loops?: RekordboxLoop[]
  beatgrid?: RekordboxBeatgridPoint[]
}

export interface RekordboxPlaylistInput {
  name: string
  trackIds: number[]
}

function attr(name: string, value: string | number | undefined): string {
  if (value === undefined) return ''
  return ` ${name}="${escapeXml(String(value))}"`
}

function buildTrackElement(track: RekordboxTrackInput): string {
  const kind = (track.filePath.split('.').pop() ?? '').toUpperCase() + ' File'
  const attrs =
    attr('TrackID', track.id) +
    attr('Name', track.name) +
    attr('Artist', track.artist) +
    attr('Composer', track.composer ?? '') +
    attr('Album', track.album ?? '') +
    attr('Grouping', '') +
    attr('Genre', track.genre ?? '') +
    attr('Kind', kind) +
    attr('Size', track.sizeBytes ?? 0) +
    attr('TotalTime', track.totalTimeSeconds !== undefined ? Math.round(track.totalTimeSeconds) : 0) +
    attr('DiscNumber', 0) +
    attr('TrackNumber', 0) +
    attr('Year', track.year ?? 0) +
    attr('AverageBpm', track.averageBpm !== undefined ? track.averageBpm.toFixed(2) : '0.00') +
    attr('DateAdded', track.dateAdded ?? new Date().toISOString().slice(0, 10)) +
    attr('BitRate', track.bitRateKbps ?? 0) +
    attr('SampleRate', track.sampleRateHz ?? 44100) +
    attr('Comments', track.comments ?? '') +
    attr('PlayCount', 0) +
    attr('Rating', 0) +
    attr('Location', pathToFileUri(track.filePath)) +
    attr('Remixer', track.remixer ?? '') +
    attr('Tonality', track.tonality ?? '') +
    attr('Label', track.label ?? '') +
    attr('Mix', '')

  const children: string[] = []

  for (const point of track.beatgrid ?? []) {
    children.push(
      `      <TEMPO Inizio="${point.positionSeconds.toFixed(3)}" Bpm="${point.bpm.toFixed(2)}" Metro="${
        point.meterNumerator ?? 4
      }/${point.meterDenominator ?? 4}" Battito="1"/>`
    )
  }

  for (const cue of track.cues ?? []) {
    children.push(
      `      <POSITION_MARK Name="${escapeXml(cue.name ?? '')}" Type="0" Start="${cue.positionSeconds.toFixed(
        3
      )}" Num="${cue.num}"/>`
    )
  }

  for (const loop of track.loops ?? []) {
    children.push(
      `      <POSITION_MARK Name="${escapeXml(loop.name ?? '')}" Type="4" Start="${loop.startSeconds.toFixed(
        3
      )}" End="${loop.endSeconds.toFixed(3)}" Num="${loop.num}"/>`
    )
  }

  if (children.length === 0) {
    return `    <TRACK${attrs}/>`
  }
  return `    <TRACK${attrs}>\n${children.join('\n')}\n    </TRACK>`
}

function buildPlaylistsElement(playlists: RekordboxPlaylistInput[]): string {
  const nodes = playlists.map((playlist) => {
    const trackRefs = playlist.trackIds.map((id) => `        <TRACK Key="${id}"/>`).join('\n')
    return `      <NODE Name="${escapeXml(playlist.name)}" Type="1" KeyType="0" Entries="${playlist.trackIds.length}">\n${trackRefs}\n      </NODE>`
  })
  return `  <PLAYLISTS>\n    <NODE Type="0" Name="ROOT" Count="${playlists.length}">\n${nodes.join('\n')}\n    </NODE>\n  </PLAYLISTS>`
}

export function buildRekordboxXml(
  tracks: RekordboxTrackInput[],
  playlists: RekordboxPlaylistInput[] = []
): string {
  const trackElements = tracks.map(buildTrackElement).join('\n')
  const playlistsElement = buildPlaylistsElement(playlists)

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '',
    '<DJ_PLAYLISTS Version="1.0.0">',
    '  <PRODUCT Name="DJ Companion" Version="0.1.0" Company="DJ Companion"/>',
    `  <COLLECTION Entries="${tracks.length}">`,
    trackElements,
    '  </COLLECTION>',
    playlistsElement,
    '</DJ_PLAYLISTS>',
    ''
  ].join('\n')
}
