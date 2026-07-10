import type { Rgbw, Scene } from './types'

/**
 * Built-in preset collection, organized for the preset browser. Presets
 * lean on kind-targeting ('kind:movingHead', 'kind:fog', …) so they light
 * the right fixtures on ANY rig with zero group setup — a fog preset finds
 * your fog machine wherever it's patched. Layered presets combine several
 * targets (pars + movers + strobes) into one look.
 *
 * Momentary presets (fog/strobe bursts) fire while the pad is held.
 */

const WHITE: Rgbw = { r: 255, g: 255, b: 255, w: 255 }

function scene(
  id: string,
  name: string,
  uiColor: string,
  targets: Scene['targets'],
  momentary = false
): Scene {
  return { id, name, uiColor, targets, ...(momentary ? { momentary: true } : {}) }
}

export interface PresetCategory {
  name: string
  description: string
  scenes: Scene[]
}

export const PRESET_LIBRARY: PresetCategory[] = [
  {
    name: 'Vibes',
    description: 'All-purpose looks that set a mood across every fixture.',
    scenes: [
      scene('preset-warm-house', 'Warm House', '#f59e0b', [
        { group: 'all', color: { r: 255, g: 120, b: 20 }, dimmer: 0.85, effect: { type: 'beatPulse' } }
      ]),
      scene('preset-deep-blue', 'Deep & Blue', '#3b82f6', [
        {
          group: 'all',
          color: { r: 20, g: 60, b: 255 },
          dimmer: 0.7,
          effect: {
            type: 'colorCycle',
            beats: 8,
            colors: [
              { r: 20, g: 60, b: 255 },
              { r: 90, g: 20, b: 220 },
              { r: 0, g: 140, b: 200 }
            ]
          }
        }
      ]),
      scene('preset-neon-club', 'Neon Club', '#ec4899', [
        {
          group: 'all',
          color: { r: 0, g: 230, b: 255 },
          dimmer: 0.9,
          effect: {
            type: 'colorCycle',
            beats: 4,
            colors: [
              { r: 0, g: 230, b: 255 },
              { r: 255, g: 0, b: 180 }
            ]
          }
        }
      ]),
      scene('preset-golden-hour', 'Golden Hour', '#fbbf24', [
        {
          group: 'all',
          color: { r: 255, g: 170, b: 40 },
          dimmer: 0.75,
          effect: {
            type: 'colorCycle',
            beats: 16,
            colors: [
              { r: 255, g: 170, b: 40 },
              { r: 255, g: 110, b: 30 },
              { r: 255, g: 200, b: 90 }
            ]
          }
        }
      ]),
      scene('preset-rainbow-flow', 'Rainbow Flow', '#8b5cf6', [
        { group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 0.8, effect: { type: 'rainbow', beats: 16 } }
      ]),
      scene('preset-sunset', 'Sunset', '#f472b6', [
        {
          group: 'all',
          color: { r: 255, g: 60, b: 90 },
          dimmer: 0.6,
          effect: {
            type: 'colorCycle',
            beats: 16,
            colors: [
              { r: 255, g: 60, b: 90 },
              { r: 255, g: 120, b: 40 },
              { r: 200, g: 40, b: 160 }
            ]
          }
        }
      ])
    ]
  },
  {
    name: 'Beams & Movers',
    description: 'Show off moving heads, beam bars, and scanners.',
    scenes: [
      scene('preset-beam-storm', 'Beam Storm', '#e2e8f0', [
        { group: 'all', color: { r: 30, g: 30, b: 60 }, dimmer: 0.25 },
        {
          group: 'kind:movingHead',
          color: WHITE,
          dimmer: 1,
          effect: { type: 'movementCircle', beats: 2, amplitude: 0.8 }
        },
        {
          group: 'kind:movingBar',
          color: WHITE,
          dimmer: 1,
          effect: { type: 'movementSweep', beats: 2, amplitude: 0.9 }
        }
      ]),
      scene('preset-sky-sweep', 'Sky Sweep', '#60a5fa', [
        { group: 'all', color: { r: 10, g: 30, b: 120 }, dimmer: 0.35, effect: { type: 'beatPulse' } },
        {
          group: 'kind:movingHead',
          color: { r: 80, g: 160, b: 255 },
          dimmer: 1,
          effect: { type: 'movementSweep', beats: 8, amplitude: 0.9 }
        }
      ]),
      scene('preset-wave-motion', 'Wave Motion', '#22d3ee', [
        {
          group: 'all',
          color: { r: 0, g: 200, b: 220 },
          dimmer: 0.85,
          effect: { type: 'movementSweep', beats: 4, amplitude: 0.7 }
        }
      ]),
      scene('preset-crossfire', 'Crossfire', '#f87171', [
        { group: 'all', color: { r: 120, g: 0, b: 0 }, dimmer: 0.3 },
        {
          group: 'kind:movingHead',
          color: { r: 255, g: 40, b: 0 },
          dimmer: 1,
          effect: { type: 'chase', beats: 1, colors: [{ r: 255, g: 40, b: 0 }, WHITE] }
        },
        {
          group: 'kind:scanner',
          color: { r: 255, g: 40, b: 0 },
          dimmer: 1,
          effect: { type: 'movementCircle', beats: 4, amplitude: 0.9 }
        }
      ]),
      scene('preset-pixel-run', 'Pixel Run', '#a3e635', [
        {
          group: 'kind:bar',
          color: { r: 120, g: 255, b: 40 },
          dimmer: 1,
          effect: {
            type: 'chase',
            beats: 1,
            colors: [
              { r: 120, g: 255, b: 40 },
              { r: 0, g: 200, b: 255 }
            ]
          }
        },
        { group: 'kind:par', color: { r: 20, g: 60, b: 20 }, dimmer: 0.4, effect: { type: 'beatPulse' } }
      ])
    ]
  },
  {
    name: 'Energy',
    description: 'Peak-time pressure — drops, builds, and full-rig moments.',
    scenes: [
      scene('preset-peak-time', 'Peak Time', '#ef4444', [
        {
          group: 'all',
          color: { r: 255, g: 0, b: 0 },
          dimmer: 1,
          effect: {
            type: 'chase',
            beats: 1,
            colors: [{ r: 255, g: 0, b: 0 }, WHITE, { r: 255, g: 0, b: 180 }]
          }
        }
      ]),
      scene('preset-full-throttle', 'Full Throttle', '#fb923c', [
        { group: 'kind:par', color: WHITE, dimmer: 1, effect: { type: 'bassPulse' } },
        {
          group: 'kind:movingHead',
          color: { r: 255, g: 120, b: 0 },
          dimmer: 1,
          effect: { type: 'movementCircle', beats: 2, amplitude: 0.9 }
        },
        { group: 'kind:laser', color: { r: 0, g: 255, b: 0 }, dimmer: 1 },
        { group: 'kind:derby', color: { r: 255, g: 60, b: 0 }, dimmer: 1 }
      ]),
      scene('preset-bass-reactor', 'Bass Reactor', '#22c55e', [
        { group: 'all', color: WHITE, dimmer: 1, effect: { type: 'bassPulse' } }
      ]),
      scene('preset-audio-glow', 'Audio Glow', '#14b8a6', [
        { group: 'all', color: { r: 0, g: 220, b: 180 }, dimmer: 1, effect: { type: 'audioLevel' } }
      ]),
      scene('preset-red-alert', 'Red Alert', '#dc2626', [
        { group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, effect: { type: 'beatPulse', beats: 1 } }
      ]),
      scene('preset-whiteout-strobe', 'Whiteout Strobe', '#f2f2f5', [
        { group: 'all', color: WHITE, dimmer: 1, effect: { type: 'strobe' } }
      ])
    ]
  },
  {
    name: 'Chill',
    description: 'Openers, warm-ups, and cool-downs.',
    scenes: [
      scene('preset-slow-cinematic', 'Slow Cinematic', '#94a3b8', [
        {
          group: 'all',
          color: { r: 120, g: 140, b: 255 },
          dimmer: 0.5,
          effect: {
            type: 'colorCycle',
            beats: 32,
            colors: [
              { r: 120, g: 140, b: 255 },
              { r: 180, g: 120, b: 255 },
              { r: 90, g: 200, b: 255 }
            ]
          }
        }
      ]),
      scene('preset-deep-space', 'Deep Space', '#6366f1', [
        { group: 'all', color: { r: 40, g: 0, b: 160 }, dimmer: 0.45, effect: { type: 'audioLevel' } },
        {
          group: 'kind:movingHead',
          color: { r: 90, g: 60, b: 255 },
          dimmer: 0.7,
          effect: { type: 'movementCircle', beats: 16, amplitude: 0.4 }
        }
      ]),
      scene('preset-candlelight', 'Candlelight', '#fdba74', [
        { group: 'all', color: { r: 255, g: 140, b: 40 }, dimmer: 0.35, effect: { type: 'audioLevel' } }
      ]),
      scene('preset-emerald-city', 'Emerald City', '#10b981', [
        {
          group: 'all',
          color: { r: 0, g: 220, b: 120 },
          dimmer: 0.6,
          effect: {
            type: 'colorCycle',
            beats: 16,
            colors: [
              { r: 0, g: 220, b: 120 },
              { r: 0, g: 160, b: 200 }
            ]
          }
        }
      ])
    ]
  },
  {
    name: 'FX & Bursts',
    description: 'Kind-aware effects — they find your fog, lasers, UV, and strobes automatically. HOLD pads fire while pressed.',
    scenes: [
      scene(
        'preset-fog-burst',
        'Fog Burst',
        '#9ca3af',
        [
          { group: 'kind:fog', color: WHITE, dimmer: 1 },
          { group: 'kind:par', color: { r: 120, g: 130, b: 160 }, dimmer: 0.5 }
        ],
        true
      ),
      scene(
        'preset-strobe-hit',
        'Strobe Hit',
        '#fafafa',
        [
          { group: 'kind:strobe', color: WHITE, dimmer: 1, effect: { type: 'strobe' } },
          { group: 'kind:par', color: WHITE, dimmer: 1, effect: { type: 'strobe' } }
        ],
        true
      ),
      scene(
        'preset-blinder',
        'Blinder',
        '#fef08a',
        [{ group: 'all', color: { r: 255, g: 230, b: 180, w: 255 }, dimmer: 1 }],
        true
      ),
      scene('preset-laser-storm', 'Laser Storm', '#4ade80', [
        { group: 'all', color: { r: 0, g: 30, b: 0 }, dimmer: 0.2 },
        { group: 'kind:laser', color: { r: 0, g: 255, b: 0 }, dimmer: 1 },
        { group: 'kind:derby', color: { r: 0, g: 255, b: 80 }, dimmer: 0.9 }
      ]),
      scene('preset-uv-rave', 'UV Rave', '#a855f7', [
        { group: 'kind:uv', color: WHITE, dimmer: 1 },
        {
          group: 'kind:par',
          color: { r: 150, g: 0, b: 255 },
          dimmer: 0.8,
          effect: { type: 'beatPulse' }
        }
      ]),
      scene('preset-derby-party', 'Derby Party', '#f97316', [
        { group: 'kind:derby', color: { r: 255, g: 120, b: 0 }, dimmer: 1 },
        {
          group: 'kind:par',
          color: { r: 255, g: 80, b: 0 },
          dimmer: 0.6,
          effect: { type: 'colorCycle', beats: 4, colors: [{ r: 255, g: 80, b: 0 }, { r: 255, g: 0, b: 120 }] }
        }
      ])
    ]
  }
]

/** Flat list, used to seed a brand-new project's scene list and pads. */
export const PRESET_SCENES: Scene[] = PRESET_LIBRARY.flatMap((category) => category.scenes)

/**
 * Sensible Smart Mode pool assignment for whichever of these presets exist
 * in a project: Chill → chill pool, Vibes/Beams → main rotation, Energy →
 * peak (drops). Momentary bursts are never auto-assigned.
 */
export function defaultSmartPools(sceneIds: string[]): {
  chill: string[]
  main: string[]
  peak: string[]
} {
  const categoryOf = new Map<string, string>()
  for (const category of PRESET_LIBRARY) {
    for (const scene of category.scenes) {
      if (!scene.momentary) categoryOf.set(scene.id, category.name)
    }
  }
  const pools = { chill: [] as string[], main: [] as string[], peak: [] as string[] }
  for (const id of sceneIds) {
    switch (categoryOf.get(id)) {
      case 'Chill':
        pools.chill.push(id)
        break
      case 'Vibes':
      case 'Beams & Movers':
        pools.main.push(id)
        break
      case 'Energy':
        pools.peak.push(id)
        break
      default:
        break
    }
  }
  return pools
}
