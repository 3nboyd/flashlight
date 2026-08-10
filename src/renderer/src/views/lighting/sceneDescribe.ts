import type { EffectSettings, Rgbw, Scene, SceneTarget } from '@core/lighting/engine/types'

/**
 * Plain-language technical summary of what a scene actually drives: which
 * fixture types each target hits, the color, and the effect. Generated from
 * the scene's targets so it stays correct for custom scenes too.
 */

const GROUP_LABELS: Record<string, string> = {
  all: 'Everything',
  'kind:movingHead': 'Moving heads',
  'kind:movingBar': 'Moving beam bars',
  'kind:par': 'Pars/washes',
  'kind:wash': 'Washes',
  'kind:laser': 'Lasers',
  'kind:derby': 'Derbies',
  'kind:fog': 'Fog machines',
  'kind:uv': 'UV / blacklight',
  'kind:strobe': 'Strobes',
  'kind:scanner': 'Scanners',
  'kind:bar': 'Pixel bars',
  'kind:dimmer': 'Dimmers'
}

export function groupLabel(group: string): string {
  if (GROUP_LABELS[group]) return GROUP_LABELS[group]
  if (group.startsWith('kind:')) return group.slice(5)
  return `"${group}" group`
}

function colorName(c: Rgbw): string {
  const r = c.r / 255
  const g = c.g / 255
  const b = c.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max < 0.1) return (c.w ?? 0) > 40 ? 'white' : 'dark'
  const light = (max + min) / 2
  const delta = max - min
  if (delta < 0.12) return light > 0.6 ? 'white' : 'grey'
  let h = 0
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  h *= 60
  if (h < 0) h += 360
  const buckets: [number, string][] = [
    [15, 'red'],
    [40, 'orange'],
    [65, 'yellow'],
    [90, 'lime'],
    [160, 'green'],
    [190, 'teal'],
    [210, 'cyan'],
    [250, 'blue'],
    [280, 'purple'],
    [320, 'magenta'],
    [345, 'pink'],
    [361, 'red']
  ]
  for (const [ceil, name] of buckets) if (h < ceil) return name
  return 'red'
}

function beats(effect: EffectSettings, fallback: number): string {
  const n = effect.beats ?? fallback
  return n === 1 ? 'every beat' : n < 1 ? `every ${n} beat` : `every ${n} beats`
}

function effectPhrase(effect: EffectSettings): string {
  switch (effect.type) {
    case 'static':
      return 'solid'
    case 'beatPulse':
      return 'pulsing on the beat'
    case 'breathe':
      return 'slow breathing'
    case 'eighthBuild':
      return '8th-note build-up'
    case 'strike':
      return `striking ${beats(effect, 4)} and holding`
    case 'colorCycle':
      return `color-cycling ${beats(effect, 4)}`
    case 'randomColor':
      return `random color ${beats(effect, 3)}`
    case 'alternate':
      return 'alternating two colors'
    case 'chase':
      return 'chasing across cells'
    case 'sparkle':
      return 'random sparkle'
    case 'rainbow':
      return 'smooth rainbow flow'
    case 'rainbowStep':
      return `rainbow snapping ${beats(effect, 1)}`
    case 'strobe':
      return 'continuous strobe'
    case 'eighthStrobe':
      return '8th-note strobe'
    case 'audioLevel':
      return 'following the volume'
    case 'bassPulse':
      return 'reacting to the bass'
    case 'movementCircle':
      return `beams orbiting ${beats(effect, 4)}`
    case 'movementSweep':
      return `beams sweeping ${beats(effect, 4)}`
    case 'movementFigure8':
      return 'beams tracing a figure-8'
    case 'movementNod':
      return 'beams nodding (tilt)'
    case 'movementRandom':
      return `beams jumping to random spots ${beats(effect, 4)}`
    case 'solo':
      return 'a lone band sweeping around'
    case 'sweep':
      return 'a bright point crossing the rig'
    case 'drift':
      return 'a soft glow roaming slowly (eerie)'
    case 'tapPulse':
      return 'blackout until you tap'
    case 'rainbowStrobe':
      return 'rainbow pixels + white LEDs popping on the beat'
    case 'songRainbow':
      return 'follows the song: rainbow wash to rainbow-strobe drop'
    case 'songRed':
      return 'follows the song: sparse red to red+white bass peak'
    case 'songFrost':
      return 'follows the song: icy swell to white-strobe drop'
    case 'melodyBeat':
      return 'black + rhythm flashes when quiet, white+color beat on the kick'
    case 'jerseyClub':
      return 'Jersey club kick bounce, a new color each pulse'
    default:
      return ''
  }
}

function targetPhrase(target: SceneTarget): string {
  const label = groupLabel(target.group)
  const color = colorName(target.color)
  const effect = target.effect && target.effect.type !== 'static' ? effectPhrase(target.effect) : 'solid'
  const moves =
    target.pan !== undefined || target.tilt !== undefined ? ' (aimed)' : ''
  return `${label}: ${color}, ${effect}${moves}`
}

export function describeScene(scene: Scene): string {
  const body = scene.targets.map(targetPhrase).join('. ')
  return scene.momentary ? `${body}. Hold the pad to fire.` : `${body}.`
}
