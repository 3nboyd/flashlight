import type { JSX } from 'react'
import type { FixtureKind } from '@core/lighting/fixtures/types'

/**
 * Hand-drawn icon set for fixture kinds, used anywhere fixtures are picked
 * or listed. Consistent 24x24 stroke style matching the app's line icons.
 */

interface IconProps {
  size?: number
  className?: string
}

function Svg({ size = 24, className, children }: IconProps & { children: React.ReactNode }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

export const FIXTURE_ICONS: Record<FixtureKind, (props: IconProps) => JSX.Element> = {
  par: (p) => (
    <Svg {...p}>
      {/* Par can with beam */}
      <path d="M9 14 7.5 20.5h9L15 14Z" />
      <path d="M9 14h6M10 14l1-4h2l1 4" />
      <path d="M12 3v3M7 5l1.6 2.2M17 5l-1.6 2.2" />
    </Svg>
  ),
  wash: (p) => (
    <Svg {...p}>
      <path d="M8 15 6.5 21h11L16 15Z" />
      <path d="M8 15h8" />
      <path d="M12 4v3M6 6l2 2M18 6l-2 2M3.5 10l2.8 1M20.5 10l-2.8 1" />
    </Svg>
  ),
  movingHead: (p) => (
    <Svg {...p}>
      {/* Yoke + head */}
      <path d="M6 4h12M8 4v5M16 4v5" />
      <ellipse cx="12" cy="12" rx="4.2" ry="5" />
      <path d="M10.5 16.5 9 21M13.5 16.5 15 21" opacity="0.65" />
    </Svg>
  ),
  movingBar: (p) => (
    <Svg {...p}>
      <rect x="2.5" y="6" width="19" height="4.4" rx="1" />
      <circle cx="6.5" cy="8.2" r="1" />
      <circle cx="12" cy="8.2" r="1" />
      <circle cx="17.5" cy="8.2" r="1" />
      <path d="M6.5 11v7M12 11l2 7M17.5 11l4 6" opacity="0.65" />
    </Svg>
  ),
  bar: (p) => (
    <Svg {...p}>
      <rect x="2.5" y="9.8" width="19" height="4.4" rx="1" />
      <circle cx="5.6" cy="12" r="0.9" />
      <circle cx="9.9" cy="12" r="0.9" />
      <circle cx="14.2" cy="12" r="0.9" />
      <circle cx="18.5" cy="12" r="0.9" />
    </Svg>
  ),
  strobe: (p) => (
    <Svg {...p}>
      <rect x="4" y="8" width="16" height="8" rx="1.5" />
      <path d="M12.8 9.5 10 12.4h4l-2.8 2.9" strokeWidth="1.4" />
    </Svg>
  ),
  laser: (p) => (
    <Svg {...p}>
      <rect x="8" y="4" width="8" height="5" rx="1" />
      <path d="M12 9v0M12 9 5 20M12 9l0 11M12 9l7 11" opacity="0.8" />
    </Svg>
  ),
  derby: (p) => (
    <Svg {...p}>
      <path d="M5.5 12a6.5 6.5 0 0 1 13 0Z" />
      <path d="M12 5.5v-2M12 12 7 19M12 12v8M12 12l5 7" opacity="0.65" />
    </Svg>
  ),
  scanner: (p) => (
    <Svg {...p}>
      <rect x="3.5" y="8" width="11" height="7" rx="1.5" />
      <path d="M14.5 11.5 20 8.5v7Z" />
      <path d="M20 12l1.5 4" opacity="0.65" />
    </Svg>
  ),
  uv: (p) => (
    <Svg {...p}>
      <path d="M8 15 6.5 21h11L16 15Z" />
      <path d="M8 15h8" />
      <path d="M9 6c0 2 1.2 3 3 3s3-1 3-3" />
      <path d="M12 9v3" />
    </Svg>
  ),
  fog: (p) => (
    <Svg {...p}>
      <rect x="4" y="13" width="13" height="6" rx="1.5" />
      <path d="M17 14c2-1.5 1-3.5 3-4.5M17.5 17c2.5-.5 2-2.5 4-3" opacity="0.7" />
    </Svg>
  ),
  dimmer: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 5.5v13" />
      <path d="M12 5.5a6.5 6.5 0 0 1 0 13" fill="currentColor" fillOpacity="0.25" stroke="none" />
    </Svg>
  ),
  screen: (p) => (
    <Svg {...p}>
      {/* Flatscreen TV on a stand */}
      <rect x="3" y="5" width="18" height="11" rx="1.5" />
      <path d="M9 20h6M12 16v4" />
    </Svg>
  ),
  other: (p) => (
    <Svg {...p}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M12 10v.5M12 13v1" />
    </Svg>
  )
}

export function FixtureIcon({ kind, size, className }: IconProps & { kind: FixtureKind }): JSX.Element {
  const Icon = FIXTURE_ICONS[kind] ?? FIXTURE_ICONS.other
  return <Icon size={size} className={className} />
}

export const KIND_LABELS: Record<FixtureKind, string> = {
  par: 'Par / Wash',
  wash: 'Wash',
  movingHead: 'Moving Head',
  movingBar: 'Moving Bar',
  bar: 'Pixel Bar',
  strobe: 'Strobe',
  laser: 'Laser',
  derby: 'Derby',
  scanner: 'Scanner',
  uv: 'UV',
  fog: 'Fog',
  dimmer: 'Dimmer',
  screen: 'TV / Screen',
  other: 'Other'
}
