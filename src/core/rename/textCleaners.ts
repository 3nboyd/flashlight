/**
 * Deterministic filename/title cleaning rules - no AI involved, matching
 * how tools like Lexicon do "Smart Fixes". Each rule is intentionally
 * conservative (only strips well-known download-site junk) and reports
 * whether it changed anything, so the UI can show exactly what was applied
 * and let the user reject individual fixes before anything is renamed.
 */

export interface CleanerRule {
  id: string
  label: string
  apply: (input: string) => string
}

const PROMO_PHRASES = [
  'free download',
  'free dl',
  'download free',
  'out now',
  'official audio',
  'official video',
  'official music video',
  'official lyric video',
  'lyric video',
  'visualizer',
  'no copyright',
  'copyright free',
  'ncs release',
  'monstercat release'
]

// UTF-8 bytes that were mistakenly re-decoded as Latin-1/Windows-1252,
// expressed via explicit unicode escapes to avoid source-encoding ambiguity.
const MOJIBAKE_FIXES: Array<[string, string]> = [
  ['â€™', '’'], // right single quote
  ['â€˜', '‘'], // left single quote
  ['â€œ', '“'], // left double quote
  ['â€', '”'], // right double quote
  ['â€“', '–'], // en dash
  ['â€”', '-'], // em dash
  ['Ã©', 'é'], // é
  ['Ã¨', 'è'], // è
  ['Ã±', 'ñ'], // ñ
  ['Ã¼', 'ü'], // ü
  ['Ã¶', 'ö'], // ö
  ['Ã¤', 'ä'], // ä
  ['Â ', ' '] // non-breaking space mojibake
]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const stripPromoPhrases: CleanerRule = {
  id: 'stripPromoPhrases',
  label: 'Remove promo text (FREE DOWNLOAD, OUT NOW, etc.)',
  apply: (input) => {
    let result = input
    for (const phrase of PROMO_PHRASES) {
      const pattern = new RegExp(`[\\[(]?\\s*${escapeRegExp(phrase)}\\s*[\\])]?`, 'gi')
      result = result.replace(pattern, ' ')
    }
    return result
  }
}

export const removeUrls: CleanerRule = {
  id: 'removeUrls',
  label: 'Remove URLs',
  apply: (input) => input.replace(/\bhttps?:\/\/\S+/gi, ' ').replace(/\bwww\.\S+/gi, ' ')
}

export const fixEncodedCharacters: CleanerRule = {
  id: 'fixEncodedCharacters',
  label: 'Fix mis-encoded characters',
  apply: (input) => {
    let result = input
    for (const [broken, fixed] of MOJIBAKE_FIXES) {
      result = result.split(broken).join(fixed)
    }
    if (/%[0-9A-Fa-f]{2}/.test(result)) {
      try {
        result = decodeURIComponent(result)
      } catch {
        // Leave as-is if it isn't actually valid percent-encoding.
      }
    }
    return result
  }
}

export const removeNumberPrefix: CleanerRule = {
  id: 'removeNumberPrefix',
  label: 'Remove leading track number',
  apply: (input) => input.replace(/^\s*\d{1,3}[\s._-]+/, '')
}

export const normalizeWhitespaceAndUnderscores: CleanerRule = {
  id: 'normalizeWhitespaceAndUnderscores',
  label: 'Normalize underscores/whitespace',
  apply: (input) =>
    input
      .replace(/_/g, ' ')
      .replace(/\s*[-–-]\s*[-–-]+\s*/g, ' - ')
      .replace(/\(\s*\)|\[\s*\]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
}

function isShoutyOrFlat(input: string): boolean {
  const letters = input.replace(/[^a-zA-Z]/g, '')
  if (letters.length < 3) return false
  const upperRatio = (letters.match(/[A-Z]/g)?.length ?? 0) / letters.length
  return upperRatio === 1 || upperRatio === 0
}

export const fixCasing: CleanerRule = {
  id: 'fixCasing',
  label: 'Fix ALL CAPS / all lowercase to Title Case',
  apply: (input) => {
    if (!isShoutyOrFlat(input)) return input
    return input
      .toLowerCase()
      .split(' ')
      .map((word) => (word.length === 0 ? word : word[0].toUpperCase() + word.slice(1)))
      .join(' ')
  }
}

/**
 * Order matters: underscore/whitespace normalization runs FIRST so promo-
 * phrase and URL matching see real spaces instead of underscores (raw
 * download filenames are often "Artist_Name_-_FREE_DOWNLOAD"), then again
 * near the end to mop up whatever stripping left behind (double spaces,
 * now-empty brackets).
 */
export const DEFAULT_CLEANER_PIPELINE: CleanerRule[] = [
  normalizeWhitespaceAndUnderscores,
  removeUrls,
  fixEncodedCharacters,
  stripPromoPhrases,
  removeNumberPrefix,
  normalizeWhitespaceAndUnderscores,
  fixCasing
]

export interface CleanResult {
  cleaned: string
  appliedRuleIds: string[]
}

export function cleanText(input: string, pipeline: CleanerRule[] = DEFAULT_CLEANER_PIPELINE): CleanResult {
  let current = input
  const appliedRuleIds = new Set<string>()
  for (const rule of pipeline) {
    const next = rule.apply(current)
    if (next !== current) appliedRuleIds.add(rule.id)
    current = next
  }
  return { cleaned: current, appliedRuleIds: [...appliedRuleIds] }
}
