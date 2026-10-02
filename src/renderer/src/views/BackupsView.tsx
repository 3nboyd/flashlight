import { useEffect, useState, type JSX } from 'react'
import type { BackupEntry } from '@core/backup/types'
import { useSettingsStore } from '../state/settingsStore'
import { Banner } from '../components/Banner'
import { formatBytes } from '../utils/paths'
import './BackupsView.css'

const CATEGORY_LABELS: Record<BackupEntry['category'], string> = {
  'serato-db': 'Serato database',
  'serato-crate': 'Serato crate',
  'serato-tag': 'Serato track tag',
  'virtualdj-db': 'VirtualDJ database',
  'rekordbox-xml': 'rekordbox export',
  other: 'Other'
}

export function BackupsView(): JSX.Element {
  const { settings } = useSettingsStore()
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      const list = await window.djCompanion.backup.list()
      setBackups([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleRestore(entry: BackupEntry): Promise<void> {
    if (
      !window.confirm(
        `Restore this backup over ${entry.originalPath}? The current version of that file will be overwritten.`
      )
    ) {
      return
    }
    setError(null)
    try {
      await window.djCompanion.backup.restore(entry.id)
      setMessage(`Restored ${entry.originalPath}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handlePruneNow(): Promise<void> {
    setError(null)
    try {
      await window.djCompanion.backup.prune(settings.backupRetentionDays, settings.backupMaxTotalBytes)
      setMessage('Pruned old backups.')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const totalBytes = backups.reduce((sum, b) => sum + b.sizeBytes, 0)

  return (
    <div className="view backups-view">
      <header className="view-header">
        <h1>Backups</h1>
        <p className="view-subtitle">
          Every database or tag write is snapshotted first. Kept for {settings.backupRetentionDays} days
          or {formatBytes(settings.backupMaxTotalBytes)}, whichever comes first.
        </p>
      </header>

      {error && <Banner kind="error">{error}</Banner>}
      {message && !error && <Banner kind="success">{message}</Banner>}

      <div className="view-toolbar">
        <button className="secondary-button" onClick={refresh} disabled={loading}>
          Refresh
        </button>
        <button className="secondary-button" onClick={handlePruneNow} disabled={loading}>
          Prune Now
        </button>
        <span className="backups-total">{backups.length} backups · {formatBytes(totalBytes)}</span>
      </div>

      {backups.length === 0 ? (
        <div className="placeholder-panel">
          <h2>No backups yet</h2>
          <p>Backups appear here the first time Flashlight writes to a database or track tag.</p>
        </div>
      ) : (
        <div className="library-table-wrap">
          <table className="library-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Size</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {backups.map((entry) => (
                <tr key={entry.id}>
                  <td className="track-title-cell" title={entry.originalPath}>
                    {entry.originalPath}
                  </td>
                  <td>{CATEGORY_LABELS[entry.category]}</td>
                  <td>{formatBytes(entry.sizeBytes)}</td>
                  <td>{new Date(entry.createdAt).toLocaleString()}</td>
                  <td>
                    <button className="text-button" onClick={() => handleRestore(entry)}>
                      Restore
                    </button>
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
