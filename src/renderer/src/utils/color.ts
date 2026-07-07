interface Hsl {
  h: number
  s: number
  l: number
}

function hexToHsl(hex: string): Hsl {
  const normalized = hex.replace('#', '')
  const r = parseInt(normalized.slice(0, 2), 16) / 255
  const g = parseInt(normalized.slice(2, 4), 16) / 255
  const b = parseInt(normalized.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h /= 6
  }

  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToHex({ h, s, l }: Hsl): string {
  const sNorm = s / 100
  const lNorm = l / 100
  const k = (n: number): number => (n + h / 30) % 12
  const a = sNorm * Math.min(lNorm, 1 - lNorm)
  const f = (n: number): number =>
    lNorm - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (n: number): string =>
    Math.round(f(n) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

export interface AccentShades {
  accent: string
  accentHover: string
  accentActive: string
  accentMuted: string
  accentText: string
}

/** Derives interactive-state and on-accent text shades from a single accent hex, so
 *  settings only need to store one color and the whole UI stays consistent. */
export function deriveAccentShades(hex: string): AccentShades {
  const hsl = hexToHsl(hex)
  return {
    accent: hex,
    accentHover: hslToHex({ ...hsl, l: clamp(hsl.l + 8, 0, 92) }),
    accentActive: hslToHex({ ...hsl, l: clamp(hsl.l - 8, 0, 100) }),
    accentMuted: hslToHex({ ...hsl, l: 18, s: clamp(hsl.s * 0.55, 0, 55) }),
    accentText: hsl.l > 60 ? '#0a0a0c' : '#ffffff'
  }
}
