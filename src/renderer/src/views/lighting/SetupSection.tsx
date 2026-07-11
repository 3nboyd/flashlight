import { useState, type JSX, type ReactNode } from 'react'

/**
 * Collapsible Setup section with a modern header: chevron + title, and an
 * optional hover "?" that reveals the explanation — details on demand
 * instead of walls of text. Open/closed state persists per section.
 */

interface SetupSectionProps {
  title: string
  help?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

function storageKey(title: string): string {
  return `djc-setup-open-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

export function SetupSection({ title, help, defaultOpen = true, children }: SetupSectionProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem(storageKey(title))
    return saved === null ? defaultOpen : saved === '1'
  })

  function toggle(): void {
    setOpen((v) => {
      localStorage.setItem(storageKey(title), v ? '0' : '1')
      return !v
    })
  }

  return (
    <section className={`setup-section${open ? '' : ' collapsed'}`}>
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
