import type { JSX, ReactNode } from 'react'

export function Banner({
  kind,
  children
}: {
  kind: 'info' | 'error' | 'success'
  children: ReactNode
}): JSX.Element {
  return <div className={`banner ${kind}`}>{children}</div>
}
