import { describe, it, expect } from 'vitest'
import { splitArtistTitle, detectArtistTitleSwap, applySwap, formatArtistTitle } from './artistTitleSplit'

describe('splitArtistTitle', () => {
  it('splits on " - "', () => {
    expect(splitArtistTitle('Daft Punk - One More Time')).toEqual({
      artist: 'Daft Punk',
      title: 'One More Time',
      hadSeparator: true
    })
  })

  it('splits on en/em dashes too', () => {
    expect(splitArtistTitle('Daft Punk – One More Time').artist).toBe('Daft Punk')
    expect(splitArtistTitle('Daft Punk — One More Time').artist).toBe('Daft Punk')
  })

  it('treats a title with no separator as title-only', () => {
    expect(splitArtistTitle('Some Track With No Artist')).toEqual({
      title: 'Some Track With No Artist',
      hadSeparator: false
    })
  })

  it('does not split on a hyphen inside a word (no surrounding spaces)', () => {
    const result = splitArtistTitle('Anti-Up - Warehouse')
    expect(result.artist).toBe('Anti-Up')
    expect(result.title).toBe('Warehouse')
  })
})

describe('detectArtistTitleSwap', () => {
  it('recommends a swap when the ID3 artist tag matches the parsed title', () => {
    const candidate = splitArtistTitle('One More Time - Daft Punk')
    const analysis = detectArtistTitleSwap(candidate, { existingId3Artist: 'Daft Punk' })
    expect(analysis.swapRecommended).toBe(true)
    expect(analysis.confidence).toBeGreaterThan(0.5)
  })

  it('does not recommend a swap when the ID3 artist tag matches the parsed artist', () => {
    const candidate = splitArtistTitle('Daft Punk - One More Time')
    const analysis = detectArtistTitleSwap(candidate, { existingId3Artist: 'Daft Punk' })
    expect(analysis.swapRecommended).toBe(false)
  })

  it('uses the known-artist library index when there is no ID3 tag to check', () => {
    const candidate = splitArtistTitle('One More Time - Daft Punk')
    const analysis = detectArtistTitleSwap(candidate, {
      knownArtists: ['Daft Punk', 'Justice', 'Fred again..']
    })
    expect(analysis.swapRecommended).toBe(true)
  })

  it('does not recommend a swap with no signal at all', () => {
    const candidate = splitArtistTitle('Some Random Artist - Some Random Title')
    const analysis = detectArtistTitleSwap(candidate, { knownArtists: ['Daft Punk'] })
    expect(analysis.swapRecommended).toBe(false)
    expect(analysis.confidence).toBe(0)
  })

  it('never recommends a swap when there was no separator to begin with', () => {
    const candidate = splitArtistTitle('Just A Title')
    const analysis = detectArtistTitleSwap(candidate, { knownArtists: ['Just A Title'] })
    expect(analysis.swapRecommended).toBe(false)
  })
})

describe('applySwap / formatArtistTitle', () => {
  it('swaps artist and title', () => {
    const swapped = applySwap({ artist: 'One More Time', title: 'Daft Punk', hadSeparator: true })
    expect(swapped).toEqual({ artist: 'Daft Punk', title: 'One More Time', hadSeparator: true })
  })

  it('formats back to "Artist - Title"', () => {
    expect(formatArtistTitle({ artist: 'Daft Punk', title: 'One More Time', hadSeparator: true })).toBe(
      'Daft Punk - One More Time'
    )
  })

  it('formats a title-only candidate without a separator', () => {
    expect(formatArtistTitle({ title: 'Untitled Track', hadSeparator: false })).toBe('Untitled Track')
  })
})
