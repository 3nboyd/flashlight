import { describe, it, expect } from 'vitest'
import { cleanText } from './textCleaners'

describe('cleanText', () => {
  it('strips "FREE DOWNLOAD" and bracket wrappers around it', () => {
    const { cleaned } = cleanText('Artist - Track Name [FREE DOWNLOAD]')
    expect(cleaned).toBe('Artist - Track Name')
  })

  it('strips "Free DL" and "OUT NOW" promo tags case-insensitively', () => {
    expect(cleanText('DJ Snake - Turn Down (Free DL)').cleaned).toBe('DJ Snake - Turn Down')
    expect(cleanText('Track Name OUT NOW').cleaned).toBe('Track Name')
  })

  it('removes URLs left in a filename', () => {
    const { cleaned } = cleanText('Artist - Track https://soundcloud.com/artist/track')
    expect(cleaned).toBe('Artist - Track')
  })

  it('replaces underscores with spaces and collapses whitespace', () => {
    expect(cleanText('Artist_Name___Track___Title').cleaned).toBe('Artist Name Track Title')
  })

  it('removes a leading track-number prefix', () => {
    expect(cleanText('01 - Artist - Track Title').cleaned).toBe('Artist - Track Title')
    expect(cleanText('12. Artist - Track Title').cleaned).toBe('Artist - Track Title')
  })

  it('fixes ALL CAPS titles to Title Case', () => {
    expect(cleanText('ARTIST NAME - THE BEST TRACK OF THE YEAR').cleaned).toBe(
      'Artist Name - The Best Track Of The Year'
    )
  })

  it('fixes all-lowercase titles to Title Case', () => {
    expect(cleanText('artist name - track title').cleaned).toBe('Artist Name - Track Title')
  })

  it('leaves normally-cased titles untouched', () => {
    const { cleaned, appliedRuleIds } = cleanText('Fred again.. - Delilah (pull me out of this)')
    expect(cleaned).toBe('Fred again.. - Delilah (pull me out of this)')
    expect(appliedRuleIds).toEqual([])
  })

  it('does not strip legitimate remix/mix descriptors', () => {
    const { cleaned } = cleanText('Artist - Track (Extended Mix)')
    expect(cleaned).toBe('Artist - Track (Extended Mix)')
  })

  it('fixes common mojibake sequences', () => {
    expect(cleanText('BjÃ¶rk - JÃ³ga').cleaned).toContain('Björk')
  })

  it('reports which rules actually changed something', () => {
    const { appliedRuleIds } = cleanText('artist_name - FREE DOWNLOAD track')
    expect(appliedRuleIds).toContain('normalizeWhitespaceAndUnderscores')
    expect(appliedRuleIds).toContain('stripPromoPhrases')
    expect(appliedRuleIds).toContain('fixCasing')
  })

  it('handles combined real-world SoundCloud garbage end to end', () => {
    const { cleaned } = cleanText('01_ARTIST_NAME_-_TRACK_TITLE_(FREE_DOWNLOAD)_www.soundcloud.com')
    expect(cleaned).toBe('Artist Name - Track Title')
  })
})
