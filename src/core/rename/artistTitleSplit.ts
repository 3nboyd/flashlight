/**
 * Splits a cleaned filename/title into artist + title candidates, and
 * detects a likely artist/title swap (e.g. "Track Name - Artist" instead of
 * "Artist - Track Name") using deterministic heuristics: matching against
 * the file's own existing ID3 artist tag and/or a known-artist index built
 * from the rest of the user's library. No AI/network lookup involved.
 */

const SEPARATOR_PATTERN = /\s+[-–—]\s+/

export interface ArtistTitleCandidate {
  artist?: string
  title: string
  hadSeparator: boolean
}

export function splitArtistTitle(input: string): ArtistTitleCandidate {
  const match = input.match(SEPARATOR_PATTERN)
  if (!match || match.index === undefined) {
    return { title: input.trim(), hadSeparator: false }
  }
  const artist = input.slice(0, match.index).trim()
  const title = input.slice(match.index + match[0].length).trim()
  if (!artist || !title) {
    return { title: input.trim(), hadSeparator: false }
  }
  return { artist, title, hadSeparator: true }
}

export interface SwapAnalysis {
  swapRecommended: boolean
  confidence: number
  reason: string
}

export interface SwapDetectionContext {
  existingId3Artist?: string
  /** Artist names already known elsewhere in the user's library, for cross-referencing. */
  knownArtists?: string[]
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

export function detectArtistTitleSwap(
  candidate: ArtistTitleCandidate,
  context: SwapDetectionContext = {}
): SwapAnalysis {
  if (!candidate.hadSeparator || !candidate.artist) {
    return { swapRecommended: false, confidence: 0, reason: 'No artist/title separator found' }
  }

  const knownArtists = new Set((context.knownArtists ?? []).map(normalize))
  const parsedArtist = normalize(candidate.artist)
  const parsedTitle = normalize(candidate.title)

  if (context.existingId3Artist) {
    const id3Artist = normalize(context.existingId3Artist)
    if (id3Artist === parsedTitle && id3Artist !== parsedArtist) {
      return {
        swapRecommended: true,
        confidence: 0.9,
        reason: `File's existing artist tag ("${context.existingId3Artist}") matches the parsed title, not the parsed artist`
      }
    }
    if (id3Artist === parsedArtist) {
      return {
        swapRecommended: false,
        confidence: 0.9,
        reason: `File's existing artist tag confirms the parsed artist position`
      }
    }
  }

  const artistInIndex = knownArtists.has(parsedArtist)
  const titleInIndex = knownArtists.has(parsedTitle)
  if (titleInIndex && !artistInIndex) {
    return {
      swapRecommended: true,
      confidence: 0.7,
      reason: 'The second segment matches a known artist name in your library; the first does not'
    }
  }
  if (artistInIndex && !titleInIndex) {
    return {
      swapRecommended: false,
      confidence: 0.6,
      reason: 'The first segment matches a known artist name in your library'
    }
  }

  return { swapRecommended: false, confidence: 0, reason: 'No confident signal either way' }
}

export function formatArtistTitle(candidate: ArtistTitleCandidate): string {
  return candidate.artist ? `${candidate.artist} - ${candidate.title}` : candidate.title
}

export function applySwap(candidate: ArtistTitleCandidate): ArtistTitleCandidate {
  if (!candidate.artist) return candidate
  return { artist: candidate.title, title: candidate.artist, hadSeparator: true }
}
