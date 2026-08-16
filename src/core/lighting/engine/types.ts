/**
 * Scene/effect model. A Scene is a complete "look": per-target color +
 * intensity + optional animated effect. Targets select fixtures by group
 * tag or 'all'. Scenes are what performance pads trigger.
 */

export interface Rgbw {
  r: number
  g: number
  b: number
  w?: number
}

export type EffectType =
  | 'static'
  | 'beatPulse' // dimmer decays from full on every beat
  | 'breathe' // slow sine swell of intensity
  | 'filterSwell' // audio-reactive swell: dim + responsive when quiet, full pronounced swell on beats/builds
  | 'eighthBuild' // 8th-note pulses that ramp brighter/tighter across the phrase
  | 'strike' // a hard hit every N beats that holds and fades (occasional beam)
  | 'tapPulse' // blackout base; each manual tap flashes a cycling color + white strobe
  | 'sweep' // a bright point travels side to side across the group in stage order
  | 'drift' // a soft glow roams slowly + randomly across the rig, fading at its edges (eerie)
  | 'colorCycle' // step through colors every N beats
  | 'randomColor' // jump to a random palette color every N beats and hold
  | 'alternate' // odd/even fixtures swap two colors on the beat
  | 'chase' // one fixture (or position) lit at a time, advancing on the beat
  | 'solo' // one random cell lit at a time, switching every N beats (eerie/sparse)
  | 'sparkle' // random fixtures/cells flash each beat subdivision
  | 'rainbow' // continuous hue rotation across fixtures
  | 'rainbowStep' // rainbow that snaps to a new hue on each quarter note
  | 'rainbowStrobe' // RGB rainbows per quarter note while the white LEDs flash on the beat
  | 'strobe' // continuous strobing while the scene is active
  | 'eighthStrobe' // sharp flash on every 8th note
  | 'audioLevel' // dimmer follows overall loudness
  | 'bassPulse' // dimmer follows bass energy (kick-reactive)
  | 'movementCircle' // pan/tilt trace a circle (moving heads)
  | 'movementSweep' // pan sweeps side to side
  | 'movementFigure8' // pan/tilt trace a lissajous figure-8
  | 'movementNod' // tilt-only wave (the classic beam nod)
  | 'movementRandom' // ballyhoo: heads jump to pseudo-random positions each beat
  | 'songRainbow' // adaptive: normal rainbow pulse -> build rainbow -> rainbow-strobe peak on the drop
  | 'songRed' // adaptive: sparse red -> red crash-strobe build -> red+white bass peak
  | 'songFrost' // adaptive: icy breathe -> white riser -> blue/white strobe peak
  | 'melodyBeat' // adaptive: black + quick rhythm flashes when quiet, quarter-note white+color beat when the kick drives
  | 'jerseyClub' // tempo-locked Jersey club kick bounce, each kick a new palette color over near-black

export interface EffectSettings {
  type: EffectType
  /** Cycle length in beats for beat-driven effects (default 4). */
  beats?: number
  /** Palette for colorCycle/chase; falls back to the target's base color. */
  colors?: Rgbw[]
  /** 0-1 movement size for movement effects. */
  amplitude?: number
  /** 0-1 fraction of the group lit at once (solo band width). */
  size?: number
  /**
   * How often the white LEDs flash in rainbowStrobe, in beats (0.5 = eighth,
   * 1 = quarter, 2, 4). Independent of `beats` (which drives the color snap),
   * so the color and the white strobe can run at different rates. Default 1.
   */
  flashBeats?: number
  /**
   * Adaptive scenes: which flow patterns (0-5, see FLOW_PATTERNS) are enabled
   * for the no-kick parts. Undefined/empty = all of them.
   */
  patterns?: number[]
  /**
   * Adaptive scenes: how often the white-only LEDs strobe during the color
   * pulse, in beats (1 = every beat, 2, 4 = once a bar on the downbeat; 0 =
   * off). Default 4.
   */
  whiteBeats?: number
}

export interface SceneTarget {
  /**
   * Which fixtures this target drives:
   *  - 'all' - every patched fixture
   *  - 'kind:<kind>' - every fixture of that kind (e.g. 'kind:fog',
   *    'kind:laser', 'kind:movingHead') wherever it's patched, so presets
   *    work on any rig without group setup
   *  - anything else - a group tag from FixturePatch.group
   */
  group: string
  color: Rgbw
  /** 0-1 base intensity. */
  dimmer: number
  effect?: EffectSettings
  /** 0-255 base pan/tilt for moving fixtures in this target. */
  pan?: number
  tilt?: number
}

/**
 * Coarse grouping used to organize scenes in the browser and pad picker:
 *  - normal:  steady mood looks (the everyday palette)
 *  - build:   rising tension that escalates into a drop
 *  - flash:   strobes, blinders, and burst hits
 *  - peak:    full-rig, rainbow-crazy, drop-time energy
 *  - adaptive: one scene that follows the song (build/drop-aware)
 */
export type SceneCategory = 'normal' | 'build' | 'flash' | 'peak' | 'adaptive' | 'experimental'

export interface Scene {
  id: string
  name: string
  /** Accent color shown on the pad in the UI (hex). */
  uiColor: string
  /** Bucket for browser/picker organization; custom scenes may omit it. */
  category?: SceneCategory
  targets: SceneTarget[]
  /**
   * Momentary scenes fire while held (mouse down / MIDI note held) and
   * restore the previous look on release - bursts like fog or strobe hits.
   */
  momentary?: boolean
}

export interface LiveOverrides {
  /** 0-1 master intensity applied to everything. */
  masterDimmer: number
  blackout: boolean
  /** Momentary strobe-everything while held. */
  strobe: boolean
  /** Momentary blinder: force every fixture to full white while held. */
  blind: boolean
  /** Replaces every target's color while set. */
  colorOverride: Rgbw | null
  /** Knob: shifts every fixture's pan left/right, -1..1 (0 = no shift). */
  panOffset: number
  /** Knob: shifts every fixture's tilt up/down, -1..1. */
  tiltOffset: number
  /** Knob: multiplies movement-effect speed, 0.25..4 (1 = as programmed). */
  movementSpeed: number
  /** Knob: scales audio-reactive intensity, 0..2 (1 = as programmed). */
  reactivity: number
}

export const DEFAULT_OVERRIDES: LiveOverrides = {
  masterDimmer: 1,
  blackout: false,
  strobe: false,
  blind: false,
  colorOverride: null,
  panOffset: 0,
  tiltOffset: 0,
  movementSpeed: 1,
  reactivity: 1
}

export interface AutopilotSettings {
  enabled: boolean
  /** Advance to the next scene every N bars. */
  barsPerScene: number
  /** Scene ids in rotation order; empty = all scenes. */
  sceneIds: string[]
  /** Pseudo-random rotation order instead of sequential. */
  shuffle?: boolean
}

export type OutputProtocol = 'artnet' | 'sacn' | 'enttec'

export interface OutputSettings {
  protocol: OutputProtocol
  /** Art-Net target: broadcast or a node IP. sACN uses multicast. */
  artnetHost: string
  /** Frames per second for DMX output (typ. 30-44). */
  fps: number
  /** Serial device path for Enttec Pro-compatible USB interfaces. */
  serialPath: string | null
  /** A USB interface carries one DMX line: which patched universe it outputs. */
  usbUniverse: number
}

export interface Os2lSettings {
  enabled: boolean
  /** TCP port we listen on for the DJ software's OS2L connection. */
  port: number
}

export interface AudioInputSettings {
  /** Saved capture device; auto-listen starts with it on app launch. */
  deviceId: string | null
  deviceLabel: string | null
  autoListen: boolean
}

export type StagePropType = 'vtruss' | 'speaker' | 'booth' | 'riser' | 'screen'

export interface StageProp {
  id: string
  type: StagePropType
  /** 0-1 across the stage. */
  x: number
  /** Speaker stacks: number of boxes high (1-4). */
  stack?: number
}

/** Default adaptive/live-pulse sensitivity to faint sound (echoes/ambience).
 *  A touch below neutral so echoes don't drive the lights out of the box. */
export const DEFAULT_MELODY_SENSITIVITY = 0.55

export interface SmartSettings {
  pools: { chill: string[]; main: string[]; peak: string[] }
  /** Rotate the main pool every N 8-bar phrases while steady. */
  phrasesPerScene: number
  /** 0-1 detection eagerness. */
  sensitivity: number
}

export interface LightingProject {
  patches: import('../fixtures/types').FixturePatch[]
  scenes: Scene[]
  /** Recently deleted scenes, recoverable from the Scenes trash bin. */
  trashScenes?: Scene[]
  /** When true (default), Blackout stays engaged after switching scenes; when
   *  false, triggering a scene clears blackout like any other look. */
  blackoutHolds?: boolean
  /** Favorite colors that MIDI color controls cycle through (button = next,
   *  0-1 knob = position in the list). */
  favoriteColors?: Rgbw[]
  /** When true, a MIDI-picked color persists across scene switches; when false
   *  (default), switching scenes reverts to each scene's own default color. */
  rememberColor?: boolean
  /** Set dressing on the visualizer stage (trusses, speakers, booth…). */
  stageProps: StageProp[]
  /** User-defined fixture profiles, merged over the built-in library. */
  customFixtures: import('../fixtures/types').FixtureDefinition[]
  /** Scene ids assigned to the performance pad grid (null = empty pad). */
  padSceneIds: (string | null)[]
  /** Number of performance pads: 8, 16, 32, or 64. */
  padCount: number
  /** Scene / pool lists render as a grid of tiles or a compact list. */
  sceneViewMode: 'grid' | 'list'
  autopilot: AutopilotSettings
  smart: SmartSettings
  /** 0-1 adaptive/live-pulse sensitivity to faint sound (echoes/ambience).
   *  Lower ignores echoes more and stops the lights quicker. */
  melodySensitivity?: number
  output: OutputSettings
  os2l: Os2lSettings
  audio: AudioInputSettings
  /** MIDI controller mapping (notes → actions, CCs → knobs/faders). Saved with
   *  the project so it persists to disk + backups, like the output config. */
  midi?: import('../midi/midiMapping').MidiMapping
}

export function defaultLightingProject(): LightingProject {
  return {
    patches: [],
    scenes: [],
    trashScenes: [],
    blackoutHolds: true,
    favoriteColors: [
      { r: 255, g: 0, b: 0 },
      { r: 255, g: 120, b: 0 },
      { r: 255, g: 255, b: 255 },
      { r: 0, g: 200, b: 80 },
      { r: 0, g: 120, b: 255 },
      { r: 150, g: 0, b: 255 },
      { r: 255, g: 0, b: 160 }
    ],
    rememberColor: false,
    stageProps: [{ id: 'booth-default', type: 'booth', x: 0.5 }],
    customFixtures: [],
    padSceneIds: new Array(16).fill(null),
    padCount: 16,
    sceneViewMode: 'grid',
    autopilot: { enabled: false, barsPerScene: 8, sceneIds: [] },
    smart: { pools: { chill: [], main: [], peak: [] }, phrasesPerScene: 2, sensitivity: 0.5 },
    melodySensitivity: DEFAULT_MELODY_SENSITIVITY,
    output: {
      protocol: 'artnet',
      artnetHost: '255.255.255.255',
      fps: 40,
      serialPath: null,
      usbUniverse: 1
    },
    os2l: { enabled: true, port: 4444 },
    audio: { deviceId: null, deviceLabel: null, autoListen: true },
    midi: { notes: {}, controls: {} }
  }
}
