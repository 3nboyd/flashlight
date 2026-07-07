import { describe, it, expect } from 'vitest'
import { buildRenamePreview, buildBatchRenamePreview } from './RenameEngine'

describe('buildRenamePreview', () => {
  it('cleans junk and reports the change', () => {
    const preview = buildRenamePreview({
      filePath: '/Music/track.mp3',
      baseName: 'Artist_Name_-_Track_Title_(FREE_DOWNLOAD)',
      extension: '.mp3'
    })
    expect(preview.suggestedBaseName).toBe('Artist Name - Track Title')
    expect(preview.changed).toBe(true)
    expect(preview.appliedRuleIds).toContain('stripPromoPhrases')
  })

  it('reports changed=false when nothing needs fixing', () => {
    const preview = buildRenamePreview({
      filePath: '/Music/track.mp3',
      baseName: 'Fred again.. - Delilah (pull me out of this)',
      extension: '.mp3'
    })
    expect(preview.changed).toBe(false)
    expect(preview.suggestedBaseName).toBe(preview.originalBaseName)
  })

  it('applies a detected artist/title swap using the id3 artist tag', () => {
    const preview = buildRenamePreview(
      {
        filePath: '/Music/track.mp3',
        baseName: 'One More Time - Daft Punk',
        extension: '.mp3',
        existingId3Artist: 'Daft Punk'
      },
      { existingId3Artist: 'Daft Punk' }
    )
    expect(preview.swapRecommended).toBe(true)
    expect(preview.suggestedBaseName).toBe('Daft Punk - One More Time')
  })
})

describe('buildBatchRenamePreview', () => {
  it('processes multiple files and wires the known-artist index through for swap detection', () => {
    const previews = buildBatchRenamePreview(
      [
        { filePath: '/a.mp3', baseName: 'ARTIST_ONE_-_TRACK_ONE_[FREE_DOWNLOAD]', extension: '.mp3' },
        {
          filePath: '/b.mp3',
          baseName: 'Track Two - Artist Two',
          extension: '.mp3',
          existingId3Artist: 'Artist Two'
        },
        { filePath: '/c.mp3', baseName: 'Already Clean Title', extension: '.mp3' }
      ],
      ['Artist Two']
    )

    expect(previews).toHaveLength(3)
    expect(previews[0].suggestedBaseName).toBe('Artist One - Track One')
    expect(previews[1].suggestedBaseName).toBe('Artist Two - Track Two')
    expect(previews[1].swapRecommended).toBe(true)
    expect(previews[2].changed).toBe(false)
  })
})
