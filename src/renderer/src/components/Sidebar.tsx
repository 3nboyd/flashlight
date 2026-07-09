import type { JSX } from 'react'
import './Sidebar.css'

export type ViewId = 'library' | 'explorer' | 'rename' | 'lighting' | 'backups' | 'settings'

interface NavItem {
  id: ViewId
  label: string
  icon: JSX.Element
}

function Icon({ path }: { path: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const NAV_ITEMS: NavItem[] = [
  { id: 'library', label: 'Library', icon: <Icon path="M4 6h16M4 12h16M4 18h10" /> },
  {
    id: 'explorer',
    label: 'File Explorer',
    icon: <Icon path="M3 7h6l2 2h10v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />
  },
  { id: 'rename', label: 'Rename', icon: <Icon path="M4 7V5a1 1 0 0 1 1-1h4M20 7V5a1 1 0 0 0-1-1h-4M4 17v2a1 1 0 0 0 1 1h4m11-3v2a1 1 0 0 1-1 1h-4M8 12h8" /> },
  {
    id: 'lighting',
    label: 'Lighting',
    icon: <Icon path="M12 2v3M4.9 4.9l2.1 2.1M2 12h3M19 12h3M17 7l2.1-2.1M12 22v-3M9 18h6M10 15a5 5 0 1 1 4 0c-.7.5-1 1.2-1 2h-2c0-.8-.3-1.5-1-2Z" />
  },
  { id: 'backups', label: 'Backups', icon: <Icon path="M12 8v4l3 2M20 12a8 8 0 1 1-3-6.2" /> },
  { id: 'settings', label: 'Settings', icon: <Icon path="M10.3 4.3a1.94 1.94 0 0 1 3.4 0l.3.6a1.94 1.94 0 0 0 2.4.9l.6-.2a1.94 1.94 0 0 1 2.4 2.4l-.2.6a1.94 1.94 0 0 0 .9 2.4l.6.3a1.94 1.94 0 0 1 0 3.4l-.6.3a1.94 1.94 0 0 0-.9 2.4l.2.6a1.94 1.94 0 0 1-2.4 2.4l-.6-.2a1.94 1.94 0 0 0-2.4.9l-.3.6a1.94 1.94 0 0 1-3.4 0l-.3-.6a1.94 1.94 0 0 0-2.4-.9l-.6.2a1.94 1.94 0 0 1-2.4-2.4l.2-.6a1.94 1.94 0 0 0-.9-2.4l-.6-.3a1.94 1.94 0 0 1 0-3.4l.6-.3a1.94 1.94 0 0 0 .9-2.4l-.2-.6a1.94 1.94 0 0 1 2.4-2.4l.6.2a1.94 1.94 0 0 0 2.4-.9l.3-.6ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /> }
]

interface SidebarProps {
  active: ViewId
  onSelect: (id: ViewId) => void
}

export function Sidebar({ active, onSelect }: SidebarProps): JSX.Element {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark" />
        <span>DJ Companion</span>
      </div>
      <ul className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              className={`sidebar-nav-item${active === item.id ? ' active' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
