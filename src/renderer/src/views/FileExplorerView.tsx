import { useCallback, useEffect, useState, type JSX } from 'react'
import type { DirEntryInfo } from '@core/fileops/FileOperations'
import type { LibrarySyncResult } from '@core/fileops/LibrarySync'
import { Banner } from '../components/Banner'
import { baseName, dirName, formatBytes } from '../utils/paths'
import './FileExplorerView.css'

function summarizeSync(sync: LibrarySyncResult[]): string | null {
  const updates: string[] = []
  const seratoDb = sync.some((s) => s.seratoDatabaseUpdated)
  const crateCount = sync.reduce((sum, s) => sum + s.seratoCratesUpdated.length, 0)
  const vdj = sync.some((s) => s.virtualDjUpdated)
  if (seratoDb) updates.push('Serato database')
  if (crateCount > 0) updates.push(`${crateCount} Serato crate${crateCount === 1 ? '' : 's'}`)
  if (vdj) updates.push('VirtualDJ database')
  if (updates.length === 0) return null
  return `Synced: ${updates.join(', ')}`
}

export function FileExplorerView(): JSX.Element {
  const [currentDir, setCurrentDir] = useState<string | null>(null)
  const [entries, setEntries] = useState<DirEntryInfo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const loadDir = useCallback(async (dir: string) => {
    setLoading(true)
    setError(null)
    try {
      const results = await window.djCompanion.fileops.list(dir)
      results.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setEntries(results)
      setCurrentDir(dir)
      setSelected(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentDir) loadDir(currentDir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleOpenFolder(): Promise<void> {
    const folder = await window.djCompanion.dialog.selectFolder()
    if (folder) await loadDir(folder)
  }

  function toggleSelect(path: string, exclusive: boolean): void {
    setSelected((prev) => {
      if (exclusive) return new Set([path])
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  async function handleMove(): Promise<void> {
    if (!currentDir || selected.size === 0) return
    const dest = await window.djCompanion.dialog.selectFolder()
    if (!dest) return
    setLoading(true)
    setError(null)
    try {
      const { sync } = await window.djCompanion.fileops.moveMany([...selected], dest)
      setStatusMessage(summarizeSync(sync) ?? 'Moved.')
      await loadDir(currentDir)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy(): Promise<void> {
    if (!currentDir || selected.size === 0) return
    const dest = await window.djCompanion.dialog.selectFolder()
    if (!dest) return
    setLoading(true)
    setError(null)
    try {
      await window.djCompanion.fileops.copyMany([...selected], dest)
      setStatusMessage('Copied.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleRename(): Promise<void> {
    if (!currentDir || selected.size !== 1) return
    const path = [...selected][0]
    const newName = window.prompt('Rename to:', baseName(path))
    if (!newName || newName === baseName(path)) return
    setLoading(true)
    setError(null)
    try {
      const { sync } = await window.djCompanion.fileops.rename(path, newName)
      setStatusMessage(summarizeSync(sync) ?? 'Renamed.')
      await loadDir(currentDir)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!currentDir || selected.size === 0) return
    if (!window.confirm(`Delete ${selected.size} item(s)? This cannot be undone.`)) return
    setLoading(true)
    setError(null)
    try {
      for (const path of selected) {
        await window.djCompanion.fileops.delete(path)
      }
      setStatusMessage('Deleted.')
      await loadDir(currentDir)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleNewFolder(): Promise<void> {
    if (!currentDir) return
    const name = window.prompt('New folder name:')
    if (!name) return
    try {
      await window.djCompanion.fileops.createFolder(currentDir, name)
      await loadDir(currentDir)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="view explorer-view">
      <header className="view-header">
        <h1>File Explorer</h1>
        <p className="view-subtitle">
          Move, copy, and organize your crates - connected databases stay in sync automatically.
        </p>
      </header>

      {error && <Banner kind="error">{error}</Banner>}
      {statusMessage && !error && <Banner kind="success">{statusMessage}</Banner>}

      {!currentDir ? (
        <div className="placeholder-panel">
          <h2>No folder open</h2>
          <p>Open a folder to browse, organize, and mass-move your tracks.</p>
          <button className="primary-button" onClick={handleOpenFolder}>
            Open Folder
          </button>
        </div>
      ) : (
        <>
          <div className="explorer-toolbar">
            <div className="explorer-path-row">
              <button className="text-button" onClick={() => loadDir(dirName(currentDir))}>
                ↑ Up
              </button>
              <span className="explorer-path" title={currentDir}>
                {currentDir}
              </span>
            </div>
            <div className="explorer-actions">
              <button className="secondary-button" onClick={handleNewFolder}>
                New Folder
              </button>
              <button className="secondary-button" onClick={handleOpenFolder}>
                Open Different Folder
              </button>
            </div>
          </div>

          {selected.size > 0 && (
            <div className="explorer-selection-bar">
              <span>{selected.size} selected</span>
              <button className="secondary-button" onClick={handleMove}>
                Move to…
              </button>
              <button className="secondary-button" onClick={handleCopy}>
                Copy to…
              </button>
              {selected.size === 1 && (
                <button className="secondary-button" onClick={handleRename}>
                  Rename
                </button>
              )}
              <button className="danger-button" onClick={handleDelete}>
                Delete
              </button>
            </div>
          )}

          <div className="library-table-wrap">
            <table className="library-table explorer-table">
              <thead>
                <tr>
                  <th />
                  <th>Name</th>
                  <th>Size</th>
                  <th>Modified</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.path}
                    className={selected.has(entry.path) ? 'row-selected' : ''}
                    onClick={(e) => toggleSelect(entry.path, !e.metaKey && !e.ctrlKey)}
                    onDoubleClick={() => entry.isDirectory && loadDir(entry.path)}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(entry.path)}
                        onChange={() => toggleSelect(entry.path, false)}
                      />
                    </td>
                    <td className="track-title-cell">
                      {entry.isDirectory ? '📁 ' : '🎵 '}
                      {entry.name}
                    </td>
                    <td>{entry.isDirectory ? '-' : formatBytes(entry.sizeBytes)}</td>
                    <td>{new Date(entry.modifiedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {entries.length === 0 && !loading && <div className="explorer-empty">Empty folder.</div>}
          </div>
        </>
      )}
    </div>
  )
}
