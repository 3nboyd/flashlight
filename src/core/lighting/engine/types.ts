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
  | 'colorCycle' // step through colors every N beats
  | 'chase' // one fixture (or position) lit at a time, advancing on the beat
  | 'rainbow' // continuous hue rotation across fixtures
  | 'strobe' // continuous strobing while the scene is active
  | 'audioLevel' // dimmer follows overall loudness
  | 'bassPulse' // dimmer follows bass energy (kick-reactive)
  | 'movementCircle' // pan/tilt trace a circle (moving heads)
  | 'movementSweep' // pan sweeps side to side

export interface EffectSettings {
  type: EffectType
  /** Cycle length in beats for beat-driven effects (default 4). */
  beats?: number
  /** Palette for colorCycle/chase; falls back to the target's base color. */
  colors?: Rgbw[]
  /** 0-1 movement size for movement effects. */
  amplitude?: number
}

export interface SceneTarget {
  /** 'all' or a group tag from FixturePatch.group. */
  group: string
  color: Rgbw
  /** 0-1 base intensity. */
  dimmer: number
  effect?: EffectSettings
  /** 0-255 base pan/tilt for moving fixtures in this target. */
  pan?: number
  tilt?: number
}

export interface Scene {
  id: string
  name: string
  /** Accent color shown on the pad in the UI (hex). */
  uiColor: string
  targets: SceneTarget[]
}

export interface LiveOverrides {
  /** 0-1 master intensity applied to everything. */
  masterDimmer: number
  blackout: boolean
  /** Momentary strobe-everything while held. */
  strobe: boolean
  /** Replaces every target's color while set. */
  colorOverride: Rgbw | null
}

export const DEFAULT_OVERRIDES: LiveOverrides = {
  masterDimmer: 1,
  blackout: false,
  strobe: false,
  colorOverride: null
}

export interface AutopilotSettings {
  enabled: boolean
  /** Advance to the next scene every N bars. */
  barsPerScene: number
  /** Scene ids in rotation order; empty = all scenes. */
  sceneIds: string[]
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

export interface LightingProject {
  patches: import('../fixtures/types').FixturePatch[]
  scenes: Scene[]
  /** User-defined fixture profiles, merged over the built-in library. */
  customFixtures: import('../fixtures/types').FixtureDefinition[]
  /** Scene ids assigned to the 4x4 performance pad grid (null = empty pad). */
  padSceneIds: (string | null)[]
  autopilot: AutopilotSettings
  output: OutputSettings
  os2l: Os2lSettings
  audio: AudioInputSettings
}

export function defaultLightingProject(): LightingProject {
  return {
    patches: [],
    scenes: [],
    customFixtures: [],
    padSceneIds: new Array(16).fill(null),
    autopilot: { enabled: false, barsPerScene: 8, sceneIds: [] },
    output: {
      protocol: 'artnet',
      artnetHost: '255.255.255.255',
      fps: 40,
      serialPath: null,
      usbUniverse: 1
    },
    os2l: { enabled: true, port: 4444 },
    audio: { deviceId: null, deviceLabel: null, autoListen: true }
  }
}
