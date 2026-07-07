import { cleanText, DEFAULT_CLEANER_PIPELINE, type CleanerRule } from './textCleaners'
import {
  splitArtistTitle,
  detectArtistTitleSwap,
  applySwap,
  formatArtistTitle,
  type SwapDetectionContext
} from './artistTitleSplit'

export interface RenameCandidateInput {
  filePath: string
  /** Filename without extension. */
  baseName: string
  extension: string
  existingId3Artist?: string
}

export interface RenamePreview {
  filePath: string
  originalBaseName: string
  suggestedBaseName: string
  appliedRuleIds: string[]
  swapRecommended: boolean
  swapConfidence: number
  swapReason: string
  changed: boolean
}

export function buildRenamePreview(
  input: RenameCandidateInput,
  context: SwapDetectionContext = {},
  pipeline: CleanerRule[] = DEFAULT_CLEANER_PIPELINE
): RenamePreview {
  const { cleaned, appliedRuleIds } = cleanText(input.baseName, pipeline)
  const candidate = splitArtistTitle(cleaned)
  const swap = detectArtistTitleSwap(candidate, context)

  const finalCandidate = swap.swapRecommended ? applySwap(candidate) : candidate
  const suggestedBaseName = formatArtistTitle(finalCandidate)

  return {
    filePath: input.filePath,
    originalBaseName: input.baseName,
    suggestedBaseName,
    appliedRuleIds,
    swapRecommended: swap.swapRecommended,
    swapConfidence: swap.confidence,
    swapReason: swap.reason,
    changed: suggestedBaseName !== input.baseName
  }
}

export function buildBatchRenamePreview(
  inputs: RenameCandidateInput[],
  knownArtists: string[] = []
): RenamePreview[] {
  return inputs.map((input) =>
    buildRenamePreview(input, { existingId3Artist: input.existingId3Artist, knownArtists })
  )
}
