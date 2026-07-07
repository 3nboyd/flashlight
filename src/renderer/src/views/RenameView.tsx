import { useState, type JSX } from 'react'
import type { RenamePreview } from '@core/rename/RenameEngine'
import { Banner } from '../components/Banner'
import { baseName } from '../utils/paths'
import './RenameView.css'

function splitExt(fileName: string): { base: string; ext: string } {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex <= 0) return { base: fileName, ext: '' }
  return { base: fileName.slice(0, dotIndex), ext: fileName.slice(dotIndex) }
}

export function RenameView(): JSX.Element {
  const [previews, setPreviews] = useState<RenamePreview[]>([])
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)

  async function handleScanFolder(): Promise<void> {
    const folder = await window.djCompanion.dialog.selectFolder()
    if (!folder) return

    setLoading(true)
    setError(null)
    setApplied(false)
    try {
      const entries = await window.djCompanion.fileops.list(folder)
      const audioFiles = entries.filter(
        (e) => !e.isDirectory && /\.(mp3|flac|wav|aiff?|m4a)$/i.test(e.name)
      )
      const { tracks } = await window.djCompanion.library.scanFolder(folder)
      const artistByPath = new Map(tracks.map((t) => [t.filePath, t.metadata.artist]))
      const knownArtists = [...new Set(tracks.map((t) => t.metadata.artist).filter((a): a is string => !!a))]

      const candidates = audioFiles.map((e) => {
        const { base, ext } = splitExt(e.name)
        return {
          filePath: e.path,
          baseName: base,
          extension: ext,
          existingId3Artist: artistByPath.get(e.path)
        }
      })

      const results = await window.djCompanion.rename.preview(candidates, knownArtists)
      setPreviews(results)
      setAccepted(new Set(results.filter((r) => r.changed).map((r) => r.filePath)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  function toggleAccepted(path: string): void {
    setAccepted((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  async function handleApply(): Promise<void> {
    const items = previews
      .filter((p) => accepted.has(p.filePath))
      .map((p) => ({ filePath: p.filePath, suggestedBaseName: p.suggestedBaseName }))
    if (items.length === 0) return

    setLoading(true)
    setError(null)
    try {
      await window.djCompanion.rename.apply(items)
      setApplied(true)
      setPreviews((prev) => prev.filter((p) => !accepted.has(p.filePath)))
      setAccepted(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const changedPreviews = previews.filter((p) => p.changed)

  return (
    <div className="view rename-view">
      <header className="view-header">
        <h1>Rename</h1>
        <p className="view-subtitle">
          Clean up download junk and fix artist/title order — nothing is renamed until you approve it.
        </p>
      </header>

      {error && <Banner kind="error">{error}</Banner>}
      {applied && !error && <Banner kind="success">Renamed selected files.</Banner>}

      <div className="view-toolbar">
        <button className="primary-button" onClick={handleScanFolder} disabled={loading}>
          {loading ? 'Working…' : 'Scan Folder'}
        </button>
        {changedPreviews.length > 0 && (
          <button className="secondary-button" onClick={handleApply} disabled={accepted.size === 0 || loading}>
            Apply {accepted.size} Selected
          </button>
        )}
      </div>

      {previews.length > 0 && changedPreviews.length === 0 && (
        <div className="placeholder-panel">
          <h2>Nothing to fix</h2>
          <p>Every filename in that folder is already clean.</p>
        </div>
      )}

      {changedPreviews.length > 0 && (
        <div className="library-table-wrap">
          <table className="library-table rename-table">
            <thead>
              <tr>
                <th />
                <th>Original</th>
                <th></th>
                <th>Suggested</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {changedPreviews.map((preview) => (
                <tr key={preview.filePath}>
                  <td>
                    <input
                      type="checkbox"
                      checked={accepted.has(preview.filePath)}
                      onChange={() => toggleAccepted(preview.filePath)}
                    />
                  </td>
                  <td className="rename-original" title={preview.filePath}>
                    {baseName(preview.originalBaseName)}
                  </td>
                  <td className="rename-arrow">→</td>
                  <td className="rename-suggested">{preview.suggestedBaseName}</td>
                  <td>
                    {preview.swapRecommended && (
                      <span
                        className="confidence-badge"
                        title={preview.swapReason}
                      >{`Artist/title swapped (${Math.round(preview.swapConfidence * 100)}%)`}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
