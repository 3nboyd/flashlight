import { useState, type JSX } from 'react'
import { useSettingsStore } from '../state/settingsStore'
import { ACCENT_COLORS, type ThemeAccent } from '@core/settings/types'
import './SettingsView.css'

const ACCENT_ORDER: Exclude<ThemeAccent, 'custom'>[] = [
  'violet',
  'blue',
  'teal',
  'green',
  'amber',
  'red',
  'pink'
]

export function SettingsView(): JSX.Element {
  const { settings, update } = useSettingsStore()
  const [customHexDraft, setCustomHexDraft] = useState(settings.customAccentHex)

  const isValidHex = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value)

  return (
    <div className="view settings-view">
      <header className="view-header">
        <h1>Settings</h1>
        <p className="view-subtitle">Appearance and backup behavior for Flashlight.</p>
      </header>

      <section className="settings-section">
        <h2>Accent color</h2>
        <p className="settings-hint">Used for highlights, active states, and primary actions.</p>
        <div className="accent-grid">
          {ACCENT_ORDER.map((accent) => (
            <button
              key={accent}
              className={`accent-swatch${settings.accent === accent ? ' selected' : ''}`}
              style={{ background: ACCENT_COLORS[accent] }}
              title={accent}
              onClick={() => update({ accent })}
              aria-label={`Use ${accent} accent`}
            />
          ))}
          <button
            className={`accent-swatch custom${settings.accent === 'custom' ? ' selected' : ''}`}
            style={{
              background:
                settings.accent === 'custom'
                  ? settings.customAccentHex
                  : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)'
            }}
            title="Custom"
            onClick={() => update({ accent: 'custom' })}
            aria-label="Use custom accent"
          />
        </div>

        {settings.accent === 'custom' && (
          <div className="custom-hex-row">
            <input
              type="text"
              value={customHexDraft}
              placeholder="#8b5cf6"
              onChange={(e) => setCustomHexDraft(e.target.value)}
              onBlur={() => {
                if (isValidHex(customHexDraft)) {
                  update({ customAccentHex: customHexDraft })
                } else {
                  setCustomHexDraft(settings.customAccentHex)
                }
              }}
            />
            <input
              type="color"
              value={isValidHex(customHexDraft) ? customHexDraft : settings.customAccentHex}
              onChange={(e) => {
                setCustomHexDraft(e.target.value)
                update({ customAccentHex: e.target.value })
              }}
            />
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2>Backups</h2>
        <p className="settings-hint">
          Every write to a Serato/VirtualDJ database or embedded cue tag is snapshotted first.
          Old backups are pruned automatically.
        </p>
        <div className="settings-field-row">
          <label htmlFor="retention-days">Keep backups for</label>
          <input
            id="retention-days"
            type="number"
            min={1}
            max={365}
            value={settings.backupRetentionDays}
            onChange={(e) => update({ backupRetentionDays: Number(e.target.value) })}
          />
          <span>days</span>
        </div>
        <div className="settings-field-row">
          <label htmlFor="retention-size">Cap total backup storage at</label>
          <input
            id="retention-size"
            type="number"
            min={10}
            max={20000}
            value={Math.round(settings.backupMaxTotalBytes / (1024 * 1024))}
            onChange={(e) =>
              update({ backupMaxTotalBytes: Number(e.target.value) * 1024 * 1024 })
            }
          />
          <span>MB</span>
        </div>
      </section>

      <section className="settings-section">
        <h2>Library folders</h2>
        <p className="settings-hint">Folders scanned for tracks in the Library view.</p>
        <ul className="path-list">
          {settings.libraryFolders.map((folder) => (
            <li key={folder}>
              <span className="path-list-value" title={folder}>
                {folder}
              </span>
              <button
                className="text-button"
                onClick={() =>
                  update({ libraryFolders: settings.libraryFolders.filter((f) => f !== folder) })
                }
              >
                Remove
              </button>
            </li>
          ))}
          {settings.libraryFolders.length === 0 && (
            <li className="path-list-empty">No folders added yet.</li>
          )}
        </ul>
        <button
          className="secondary-button"
          onClick={async () => {
            const folder = await window.djCompanion.dialog.selectFolder()
            if (folder && !settings.libraryFolders.includes(folder)) {
              update({ libraryFolders: [...settings.libraryFolders, folder] })
            }
          }}
        >
          Add Folder
        </button>
      </section>

      <section className="settings-section">
        <h2>Serato</h2>
        <p className="settings-hint">
          Point this at your <code>_Serato_</code> folder (e.g. ~/Music/_Serato_) to sync hotcues,
          loops, and crate file paths.
        </p>
        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={settings.serato.enabled}
            onChange={(e) => update({ serato: { ...settings.serato, enabled: e.target.checked } })}
          />
          Enable Serato sync
        </label>
        <div className="settings-field-row">
          <span className="path-list-value" title={settings.serato.rootPath ?? ''}>
            {settings.serato.rootPath ?? 'Not set'}
          </span>
          <button
            className="text-button"
            onClick={async () => {
              const folder = await window.djCompanion.dialog.selectFolder()
              if (folder) update({ serato: { ...settings.serato, rootPath: folder } })
            }}
          >
            Choose…
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>VirtualDJ</h2>
        <p className="settings-hint">
          Point this at your <code>database.xml</code> (Documents/VirtualDJ/database.xml) to sync
          hotcues and file paths.
        </p>
        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={settings.virtualDj.enabled}
            onChange={(e) =>
              update({ virtualDj: { ...settings.virtualDj, enabled: e.target.checked } })
            }
          />
          Enable VirtualDJ sync
        </label>
        <div className="settings-field-row">
          <span className="path-list-value" title={settings.virtualDj.databasePath ?? ''}>
            {settings.virtualDj.databasePath ?? 'Not set'}
          </span>
          <button
            className="text-button"
            onClick={async () => {
              const file = await window.djCompanion.dialog.selectFile([
                { name: 'VirtualDJ Database', extensions: ['xml'] }
              ])
              if (file) update({ virtualDj: { ...settings.virtualDj, databasePath: file } })
            }}
          >
            Choose…
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>CDJ / rekordbox</h2>
        <p className="settings-hint">
          Direct USB database writing isn&rsquo;t implemented (Pioneer&rsquo;s format is
          proprietary and unsolved even by projects like Mixxx). Instead, export a{' '}
          <code>rekordbox.xml</code> from the Library view, then import it into rekordbox and sync
          to USB from there.
        </p>
      </section>
    </div>
  )
}
