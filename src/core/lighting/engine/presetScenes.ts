import type { Rgbw, Scene, SceneCategory } from './types'

/**
 * Built-in scene collection, organized into the four buckets the browser and
 * pad picker show as columns:
 *
 *   Normals  - steady mood looks for most of the night
 *   Builds   - risers that escalate into a drop
 *   Flashing - strobes, blinders, and burst hits (HOLD pads fire while held)
 *   Peaks    - full-rig, rainbow-crazy, drop-time energy
 *
 * Scenes lean on kind-targeting ('kind:movingHead', 'kind:fog', ...) so they
 * light the right fixtures on ANY rig with zero group setup, and layered
 * scenes combine several targets (pars + movers + strobes) into one look.
 */

const WHITE: Rgbw = { r: 255, g: 255, b: 255, w: 255 }

/** Vivid, well-separated colors for random-color and party looks. */
const PARTY: Rgbw[] = [
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 120, b: 255 },
  { r: 0, g: 255, b: 60 },
  { r: 255, g: 0, b: 200 },
  { r: 255, g: 160, b: 0 },
  { r: 150, g: 0, b: 255 },
  { r: 0, g: 230, b: 255 }
]

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
  category: SceneCategory
  scenes: Scene[]
}

/** Stamp the bucket onto every scene in the category so pickers can group them. */
function group(
  name: string,
  description: string,
  category: SceneCategory,
  scenes: Scene[]
): PresetCategory {
  return { name, description, category, scenes: scenes.map((s) => ({ ...s, category })) }
}

export const PRESET_LIBRARY: PresetCategory[] = [
  group('Normals', 'Steady mood looks that carry most of the night.', 'normal', [
    scene('preset-warm-house', 'Warm House', '#f59e0b', [
      { group: 'all', color: { r: 255, g: 120, b: 20 }, dimmer: 0.85, effect: { type: 'beatPulse' } }
    ]),
    scene('preset-deep-blue', 'Deep Blue', '#3b82f6', [
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
    scene('preset-emerald', 'Emerald', '#10b981', [
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
    ]),
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
    scene('preset-candlelight', 'Candlelight', '#fdba74', [
      { group: 'all', color: { r: 255, g: 140, b: 40 }, dimmer: 0.35, effect: { type: 'audioLevel' } }
    ]),
    // Single-color looks: the color is the point, so it is easy to recolor in
    // the scene editor or with the live color override.
    scene('preset-solid-color', 'Solid Color', '#0064ff', [
      { group: 'all', color: { r: 0, g: 100, b: 255 }, dimmer: 0.9 }
    ]),
    scene('preset-color-pulse', 'Color Pulse', '#00b4ff', [
      { group: 'all', color: { r: 0, g: 140, b: 255 }, dimmer: 1, effect: { type: 'beatPulse' } }
    ]),
    scene('preset-color-beam', 'Color Beam', '#22d3ee', [
      { group: 'all', color: { r: 0, g: 160, b: 255 }, dimmer: 0.85 },
      {
        group: 'kind:movingBar',
        color: { r: 0, g: 160, b: 255 },
        dimmer: 1,
        // Slow, full-range sweep - a grand arc, not a jiggle.
        effect: { type: 'movementSweep', beats: 8, amplitude: 1 }
      }
    ]),
    // Eerie/sparse: one light at a time, switching to a different one every
    // couple seconds - the rest stay dark.
    scene('preset-lone-beam', 'Lone Beam', '#b91c1c', [
      { group: 'all', color: { r: 200, g: 0, b: 0 }, dimmer: 1, effect: { type: 'solo', beats: 4 } }
    ]),
    // A bright point sweeps side to side across the rig in stage order, so it
    // reads as one light travelling left to right on any layout.
    scene('preset-side-sweep', 'Side Sweep', '#e2e8f0', [
      { group: 'all', color: WHITE, dimmer: 1, effect: { type: 'sweep', beats: 4 } }
    ])
  ]),

  group('Builds', 'Risers that tighten and brighten toward the drop.', 'build', [
    scene('preset-eighth-build', 'Eighth Build', '#e2e8f0', [
      { group: 'all', color: WHITE, dimmer: 1, effect: { type: 'eighthBuild' } }
    ]),
    scene('preset-color-riser', 'Color Riser', '#22d3ee', [
      { group: 'all', color: { r: 0, g: 200, b: 255 }, dimmer: 1, effect: { type: 'eighthBuild' } }
    ]),
    scene('preset-filter-swell', 'Filter Swell', '#a78bfa', [
      { group: 'all', color: { r: 150, g: 80, b: 255 }, dimmer: 0.9, effect: { type: 'breathe', beats: 8 } }
    ]),
    scene('preset-snare-rush', 'Snare Rush', '#fb7185', [
      { group: 'all', color: { r: 255, g: 40, b: 60 }, dimmer: 1, effect: { type: 'eighthBuild' } },
      {
        group: 'kind:movingHead',
        color: { r: 255, g: 40, b: 60 },
        dimmer: 1,
        effect: { type: 'movementSweep', beats: 5, amplitude: 1 }
      }
    ])
  ]),

  group(
    'Flashing',
    'Strobes, blinders, and burst hits. HOLD pads fire only while pressed.',
    'flash',
    [
      scene('preset-eighth-strobe', 'Eighth Strobe', '#fafafa', [
        { group: 'all', color: WHITE, dimmer: 1, effect: { type: 'eighthStrobe' } }
      ]),
      scene('preset-color-strobe', 'Color Strobe', '#38bdf8', [
        { group: 'all', color: { r: 0, g: 180, b: 255 }, dimmer: 1, effect: { type: 'eighthStrobe' } }
      ]),
      scene('preset-whiteout-strobe', 'Whiteout Strobe', '#f2f2f5', [
        { group: 'all', color: WHITE, dimmer: 1, effect: { type: 'strobe' } }
      ]),
      scene(
        'preset-blinder',
        'Blinder',
        '#fef08a',
        [{ group: 'all', color: { r: 255, g: 230, b: 180, w: 255 }, dimmer: 1 }],
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
        'preset-fog-burst',
        'Fog Burst',
        '#9ca3af',
        [
          { group: 'kind:fog', color: WHITE, dimmer: 1 },
          { group: 'kind:par', color: { r: 120, g: 130, b: 160 }, dimmer: 0.5 }
        ],
        true
      ),
      // Barely-visible colored base; each manual tap punches to full with a
      // white strobe peak and cycles the color. Tap it (a pad set to Tap Pulse,
      // or a MIDI pad) along to the melody.
      scene('preset-tap-pulse', 'Tap Pulse', '#f472b6', [
        { group: 'all', color: { r: 255, g: 0, b: 90 }, dimmer: 1, effect: { type: 'tapPulse', colors: PARTY } }
      ])
    ]
  ),

  group('Peaks', 'Full-rig, rainbow-crazy, drop-time energy.', 'peak', [
    scene('preset-rainbow-peak', 'Rainbow Peak', '#f43f5e', [
      { group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, effect: { type: 'rainbowStep', beats: 1 } },
      // Strobes: RGB rainbows on the quarter note while their white LEDs flash
      // on the beat.
      { group: 'kind:strobe', color: WHITE, dimmer: 1, effect: { type: 'rainbowStrobe', beats: 1 } }
    ]),
    scene('preset-rainbow-flow', 'Rainbow Flow', '#8b5cf6', [
      { group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 0.85, effect: { type: 'rainbow', beats: 16 } }
    ]),
    scene('preset-random-wander', 'Random Wander', '#e879f9', [
      { group: 'all', color: { r: 255, g: 0, b: 200 }, dimmer: 1, effect: { type: 'randomColor', beats: 3, colors: PARTY } },
      {
        group: 'kind:movingHead',
        color: { r: 255, g: 0, b: 200 },
        dimmer: 1,
        effect: { type: 'movementRandom', beats: 3, amplitude: 0.9, colors: PARTY }
      }
    ]),
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
        effect: { type: 'movementCircle', beats: 6, amplitude: 0.9 }
      },
      { group: 'kind:laser', color: { r: 0, g: 255, b: 0 }, dimmer: 1 },
      { group: 'kind:derby', color: { r: 255, g: 60, b: 0 }, dimmer: 1 }
    ]),
    scene('preset-bass-reactor', 'Bass Reactor', '#22c55e', [
      { group: 'all', color: WHITE, dimmer: 1, effect: { type: 'bassPulse' } }
    ]),
    scene('preset-red-alert', 'Red Alert', '#dc2626', [
      { group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, effect: { type: 'beatPulse', beats: 1 } }
    ]),
    scene('preset-laser-storm', 'Laser Storm', '#4ade80', [
      { group: 'all', color: { r: 0, g: 30, b: 0 }, dimmer: 0.2 },
      { group: 'kind:laser', color: { r: 0, g: 255, b: 0 }, dimmer: 1 },
      { group: 'kind:derby', color: { r: 0, g: 255, b: 80 }, dimmer: 0.9 }
    ]),
    scene('preset-uv-rave', 'UV Rave', '#a855f7', [
      { group: 'kind:uv', color: WHITE, dimmer: 1 },
      { group: 'kind:par', color: { r: 150, g: 0, b: 255 }, dimmer: 0.8, effect: { type: 'beatPulse' } }
    ]),
    // Full-send rainbow: hue snaps every 8th note and spreads across the rig,
    // so every pixel of a bar shows a different color (no movement - a fast
    // tilt jiggle is a waste of a beam array).
    scene('preset-rainbow-overdrive', 'Rainbow Overdrive', '#f0abfc', [
      { group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, effect: { type: 'rainbowStep', beats: 0.5 } }
    ]),
    // An occasional red beam that shoots out every couple beats and holds.
    scene('preset-red-strikes', 'Red Strikes', '#ef4444', [
      { group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 1, effect: { type: 'strike', beats: 2 } },
      {
        group: 'kind:movingBar',
        color: { r: 255, g: 0, b: 0 },
        dimmer: 1,
        tilt: 210,
        effect: { type: 'strike', beats: 2 }
      }
    ])
  ])
]

/** Flat list, used to seed a brand-new project's scene list and pads. */
export const PRESET_SCENES: Scene[] = PRESET_LIBRARY.flatMap((category) => category.scenes)

/** Preset id -> bucket, used to backfill categories onto older saved scenes. */
export const PRESET_CATEGORY_BY_ID: Record<string, SceneCategory> = Object.fromEntries(
  PRESET_SCENES.map((s) => [s.id, s.category as SceneCategory])
)

/** Openers/cool-downs pulled into the Smart Mode chill pool by default. */
const CHILL_SCENE_IDS = new Set(['preset-slow-cinematic', 'preset-candlelight'])

/**
 * Sensible Smart Mode pool assignment for whichever preset scenes exist in a
 * project: peaks drive the drop pool, a couple of calm normals seed the chill
 * pool, and the rest of the steady looks fill the main rotation. Builds,
 * flashes, and momentary bursts are left for manual triggering.
 */
export function defaultSmartPools(sceneIds: string[]): {
  chill: string[]
  main: string[]
  peak: string[]
} {
  const categoryOf = new Map<string, SceneCategory | undefined>()
  const momentaryOf = new Map<string, boolean>()
  for (const category of PRESET_LIBRARY) {
    for (const s of category.scenes) {
      categoryOf.set(s.id, s.category)
      momentaryOf.set(s.id, s.momentary === true)
    }
  }
  const pools = { chill: [] as string[], main: [] as string[], peak: [] as string[] }
  for (const id of sceneIds) {
    if (momentaryOf.get(id)) continue
    const category = categoryOf.get(id)
    if (category === 'peak') pools.peak.push(id)
    else if (category === 'build' || category === 'flash') continue
    else if (CHILL_SCENE_IDS.has(id)) pools.chill.push(id)
    else pools.main.push(id)
  }
  return pools
}
