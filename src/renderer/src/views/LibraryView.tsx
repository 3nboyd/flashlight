import { useState, type JSX } from 'react'
import type { LibraryTrack } from '@core/library/Track'
import type { ScanError } from '@core/library/LibraryScanner'
import { useSettingsStore } from '../state/settingsStore'
import { Banner } from '../components/Banner'
import './LibraryView.css'

function formatDuration(seconds?: number): string {
  if (!seconds) return '-'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function LibraryView(): JSX.Element {
  const { settings, update } = useSettingsStore()
  const [tracks, setTracks] = useState<LibraryTrack[]>([])
  const [scanErrors, setScanErrors] = useState<ScanError[]>([])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasScanned, setHasScanned] = useState(false)

  async function handleScan(): Promise<void> {
    setScanning(true)
    setError(null)
    try {
      const result = await window.djCompanion.library.scanConfiguredFolders()
      setTracks(result.tracks)
      setScanErrors(result.errors)
      setHasScanned(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setScanning(false)
    }
  }

  async function handleAddFolder(): Promise<void> {
    const folder = await window.djCompanion.dialog.selectFolder()
    if (folder && !settings.libraryFolders.includes(folder)) {
      await update({ libraryFolders: [...settings.libraryFolders, folder] })
    }
  }

  const totalCues = tracks.reduce((sum, t) => sum + t.cues.length, 0)
  const totalLoops = tracks.reduce((sum, t) => sum + t.loops.length, 0)

  return (
    <div className="view library-view">
      <header className="view-header">
        <h1>Library</h1>
        <p className="view-subtitle">Your unified track database across Serato, VirtualDJ, and rekordbox.</p>
      </header>

      {error && <Banner kind="error">{error}</Banner>}
      {scanErrors.length > 0 && (
        <Banner kind="error">
          {scanErrors.length} file{scanErrors.length === 1 ? '' : 's'} couldn&rsquo;t be read and{' '}
          {scanErrors.length === 1 ? 'was' : 'were'} skipped.
        </Banner>
      )}

      {settings.libraryFolders.length === 0 ? (
        <div className="placeholder-panel">
          <h2>No folders configured</h2>
          <p>Add a music folder to start scanning your library for tags, hotcues, and loops.</p>
          <button className="primary-button" onClick={handleAddFolder}>
            Add Folder
          </button>
        </div>
      ) : (
        <>
          <div className="library-toolbar">
            <div className="library-folder-chips">
              {settings.libraryFolders.map((f) => (
                <span key={f} className="folder-chip" title={f}>
                  {f.split(/[/\\]/).pop()}
                </span>
              ))}
              <button className="text-button" onClick={handleAddFolder}>
                + Add folder
              </button>
            </div>
            <button className="primary-button" onClick={handleScan} disabled={scanning}>
              {scanning ? 'Scanning…' : 'Scan Library'}
            </button>
          </div>

          {hasScanned && (
            <div className="library-summary">
              <span>{tracks.length} tracks</span>
              <span>{totalCues} hotcues</span>
              <span>{totalLoops} loops</span>
              <span>{tracks.filter((t) => t.sources.serato).length} with Serato tags</span>
            </div>
          )}

          {tracks.length > 0 && (
            <div className="library-table-wrap">
              <table className="library-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Artist</th>
                    <th>Album</th>
                    <th>Genre</th>
                    <th>BPM</th>
                    <th>Duration</th>
                    <th>Cues</th>
                    <th>Loops</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {tracks.map((track) => (
                    <tr key={track.filePath}>
                      <td className="track-title-cell" title={track.filePath}>
                        {track.metadata.title || track.filePath.split(/[/\\]/).pop()}
                      </td>
                      <td>{track.metadata.artist || '-'}</td>
                      <td>{track.metadata.album || '-'}</td>
                      <td>{track.metadata.genre || '-'}</td>
                      <td>{track.metadata.bpm ? Math.round(track.metadata.bpm) : '-'}</td>
                      <td>{formatDuration(track.metadata.durationSeconds)}</td>
                      <td>{track.cues.length || '-'}</td>
                      <td>{track.loops.length || '-'}</td>
                      <td>
                        {track.sources.serato && <span className="source-badge serato">Serato</span>}
                        {track.sources.virtualDj && <span className="source-badge vdj">VDJ</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hasScanned && tracks.length === 0 && !scanning && (
            <div className="placeholder-panel">
              <h2>No tracks found</h2>
              <p>No supported audio files (mp3, flac, wav, aiff, m4a) were found in the configured folders.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
