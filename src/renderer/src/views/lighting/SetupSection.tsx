import { createContext, useContext, useState, type JSX, type ReactNode } from 'react'

/**
 * Collapsible Setup section with a modern header: chevron + title, and an
 * optional hover "?" that reveals the explanation instead of walls of text.
 * Open/closed state persists per section.
 *
 * Sections declare which view(s) they belong to (Setup vs. Settings); the
 * surrounding SetupViewContext decides whether each renders, so one panel
 * component powers both sidebar views.
 */

export type SetupView = 'setup' | 'settings'

export const SetupViewContext = createContext<SetupView>('setup')

interface SetupSectionProps {
  title: string
  /** Anchor id for sidebar jump-links. */
  id?: string
  help?: ReactNode
  /** Views this section appears in (default: Setup only). */
  views?: SetupView[]
  defaultOpen?: boolean
  children: ReactNode
}

function storageKey(title: string): string {
  return `djc-setup-open-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

export function SetupSection({
  title,
  id,
  help,
  views = ['setup'],
  defaultOpen = true,
  children
}: SetupSectionProps): JSX.Element | null {
  const currentView = useContext(SetupViewContext)
  const [open, setOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem(storageKey(title))
    return saved === null ? defaultOpen : saved === '1'
  })

  if (!views.includes(currentView)) return null

  function toggle(): void {
    setOpen((v) => {
      localStorage.setItem(storageKey(title), v ? '0' : '1')
      return !v
    })
  }

  return (
    <section id={id ? `setup-sec-${id}` : undefined} className={`setup-section${open ? '' : ' collapsed'}`}>
      <div className="setup-section-header" onClick={toggle}>
        <span className={`setup-chevron${open ? ' open' : ''}`}>›</span>
        <h2>{title}</h2>
        {help && (
          <span className="help-bubble" onClick={(e) => e.stopPropagation()}>
            ?
            <span className="help-tooltip">{help}</span>
          </span>
        )}
      </div>
      {open && <div className="setup-section-body">{children}</div>}
    </section>
  )
}
