import type { JSX } from 'react'
import './Sidebar.css'

/**
 * Two-level navigation: a slim icon rail picks the app section (Music
 * library tools, Lighting, Camera, Settings), and a contextual sidebar
 * lists that section's views — so Lighting gets Perform/Setup right in the
 * sidebar instead of tabs buried in a header.
 */

export type Section = 'music' | 'lighting' | 'camera' | 'settings'

export type MusicViewId = 'library' | 'explorer' | 'rename' | 'backups'
export type LightingViewId = 'perform' | 'setup'

export interface NavState {
  section: Section
  musicView: MusicViewId
  lightingView: LightingViewId
}

function Icon({ path, size = 20 }: { path: string; size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const RAIL_ITEMS: { id: Section; label: string; icon: JSX.Element; disabled?: boolean }[] = [
  {
    id: 'music',
    label: 'Music',
    icon: <Icon path="M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm10-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z" />
  },
  {
    id: 'lighting',
    label: 'Lighting',
    icon: <Icon path="M12 2v3M4.9 4.9l2.1 2.1M2 12h3M19 12h3M17 7l2.1-2.1M10 15a5 5 0 1 1 4 0c-.7.5-1 1.2-1 2h-2c0-.8-.3-1.5-1-2ZM9 20h6" />
  },
  {
    id: 'camera',
    label: 'Camera',
    icon: <Icon path="M4 8h3l2-2h6l2 2h3v11H4V8Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />,
    disabled: true
  }
]

const MUSIC_ITEMS: { id: MusicViewId; label: string; icon: JSX.Element }[] = [
  { id: 'library', label: 'Library', icon: <Icon path="M4 6h16M4 12h16M4 18h10" size={18} /> },
  { id: 'explorer', label: 'File Explorer', icon: <Icon path="M3 7h6l2 2h10v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" size={18} /> },
  {
    id: 'rename',
    label: 'Rename',
    icon: <Icon path="M4 7V5a1 1 0 0 1 1-1h4M20 7V5a1 1 0 0 0-1-1h-4M4 17v2a1 1 0 0 0 1 1h4m11-3v2a1 1 0 0 1-1 1h-4M8 12h8" size={18} />
  },
  { id: 'backups', label: 'Backups', icon: <Icon path="M12 8v4l3 2M20 12a8 8 0 1 1-3-6.2" size={18} /> }
]

const LIGHTING_ITEMS: { id: LightingViewId; label: string; icon: JSX.Element }[] = [
  {
    id: 'perform',
    label: 'Perform',
    icon: <Icon path="M5 4h4v16H5zM15 4h4v16h-4zM9 9h6M9 15h6" size={18} />
  },
  {
    id: 'setup',
    label: 'Setup',
    icon: <Icon path="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4" size={18} />
  }
]

interface SidebarProps {
  nav: NavState
  onChange: (nav: NavState) => void
}

export function Sidebar({ nav, onChange }: SidebarProps): JSX.Element {
  return (
    <div className="nav-shell">
      <nav className="nav-rail">
        <div className="nav-rail-brand" title="DJ Companion" />
        {RAIL_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-rail-item${nav.section === item.id ? ' active' : ''}`}
            title={item.disabled ? `${item.label} — coming soon` : item.label}
            disabled={item.disabled}
            onClick={() => onChange({ ...nav, section: item.id })}
          >
            {item.icon}
            <span className="nav-rail-label">{item.label}</span>
          </button>
        ))}
        <div className="nav-rail-spacer" />
        <button
          className={`nav-rail-item${nav.section === 'settings' ? ' active' : ''}`}
          title="Settings"
          onClick={() => onChange({ ...nav, section: 'settings' })}
        >
          <Icon path="M10.3 4.3a1.94 1.94 0 0 1 3.4 0l.3.6a1.94 1.94 0 0 0 2.4.9l.6-.2a1.94 1.94 0 0 1 2.4 2.4l-.2.6a1.94 1.94 0 0 0 .9 2.4l.6.3a1.94 1.94 0 0 1 0 3.4l-.6.3a1.94 1.94 0 0 0-.9 2.4l.2.6a1.94 1.94 0 0 1-2.4 2.4l-.6-.2a1.94 1.94 0 0 0-2.4.9l-.3.6a1.94 1.94 0 0 1-3.4 0l-.3-.6a1.94 1.94 0 0 0-2.4-.9l-.6.2a1.94 1.94 0 0 1-2.4-2.4l.2-.6a1.94 1.94 0 0 0-.9-2.4l-.6-.3a1.94 1.94 0 0 1 0-3.4l.6-.3a1.94 1.94 0 0 0 .9-2.4l-.2-.6a1.94 1.94 0 0 1 2.4-2.4l.6.2a1.94 1.94 0 0 0 2.4-.9l.3-.6ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <span className="nav-rail-label">Settings</span>
        </button>
      </nav>

      {nav.section === 'music' && (
        <nav className="nav-context">
          <div className="nav-context-title">Music</div>
          {MUSIC_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item${nav.musicView === item.id ? ' active' : ''}`}
              onClick={() => onChange({ ...nav, musicView: item.id })}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}

      {nav.section === 'lighting' && (
        <nav className="nav-context">
          <div className="nav-context-title">Lighting</div>
          {LIGHTING_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item${nav.lightingView === item.id ? ' active' : ''}`}
              onClick={() => onChange({ ...nav, lightingView: item.id })}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
