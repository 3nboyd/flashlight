import type { ChannelSpec, FixtureDefinition } from './types'

/**
 * Built-in generic fixture profiles covering the DJ/small-club market.
 * These mirror the de-facto channel layouts that budget fixtures (and the
 * "basic" DMX modes of name brands like Chauvet DJ / ADJ) ship with -
 * e.g. multi-head wave bars follow the Intimidator Wave pattern of
 * per-head tilt plus per-head color. Pick the profile that matches your
 * fixture's mode (channel counts are in every fixture's manual); anything
 * not covered can be defined in Setup → Custom fixture profiles.
 *
 * Laser profiles are deliberately minimal (on/off + pattern) - beam
 * steering is left to the fixture's own safety-tested modes on purpose.
 */

const STROBE: ChannelSpec = { role: 'strobe', strobeOpen: 0, strobeRange: { min: 16, max: 255 } }

function rgb(segment?: number): ChannelSpec[] {
  return [
    { role: 'red', segment },
    { role: 'green', segment },
    { role: 'blue', segment }
  ]
}

function rgbw(segment?: number): ChannelSpec[] {
  return [...rgb(segment), { role: 'white', segment }]
}

export const BUILTIN_FIXTURES: FixtureDefinition[] = [
  // ---- Pars / washes ----
  {
    id: 'generic-dimmer-1ch',
    name: 'Dimmer / Warm Par (1ch)',
    kind: 'dimmer',
    channels: [{ role: 'dimmer' }]
  },
  {
    id: 'generic-rgb-3ch',
    name: 'RGB Par (3ch)',
    kind: 'par',
    channels: rgb()
  },
  {
    id: 'generic-rgb-4ch',
    name: 'RGB Par + Dimmer (4ch)',
    kind: 'par',
    channels: [{ role: 'dimmer' }, ...rgb()]
  },
  {
    id: 'generic-rgbw-8ch',
    name: 'RGBW Par (8ch: D/R/G/B/W/Strobe/Mode/Speed)',
    kind: 'par',
    channels: [
      { role: 'dimmer' },
      ...rgbw(),
      STROBE,
      { role: 'mode', staticValue: 0 },
      { role: 'speed', staticValue: 0 }
    ]
  },
  {
    id: 'generic-rgbaw-uv-6ch',
    name: 'RGBAW+UV Par (6ch)',
    kind: 'par',
    channels: [...rgb(), { role: 'amber' }, { role: 'white' }, { role: 'uv' }]
  },
  {
    id: 'generic-rgbaw-uv-7ch',
    name: 'RGBAW+UV Par + Dimmer (7ch)',
    kind: 'par',
    channels: [{ role: 'dimmer' }, ...rgb(), { role: 'amber' }, { role: 'white' }, { role: 'uv' }]
  },
  {
    id: 'generic-pinspot-3ch',
    name: 'Pin Spot RGB (3ch)',
    kind: 'par',
    channels: rgb()
  },

  // ---- Strobes ----
  {
    id: 'generic-strobe-2ch',
    name: 'Strobe (2ch: Rate/Dimmer)',
    kind: 'strobe',
    channels: [{ role: 'strobe', strobeOpen: 0, strobeRange: { min: 10, max: 255 } }, { role: 'dimmer' }]
  },
  {
    id: 'generic-rgb-strobe-5ch',
    name: 'RGB Strobe (5ch: D/R/G/B/Rate)',
    kind: 'strobe',
    channels: [{ role: 'dimmer' }, ...rgb(), { role: 'strobe', strobeOpen: 0, strobeRange: { min: 10, max: 255 } }]
  },
  {
    // RGBW strobe panel driven in its 11ch "manual" mode: channels 1-6 are the
    // live dimmer/color/strobe the engine controls; channels 7-11 are the
    // fixture's own effect-macro selectors, pinned to 0 so it obeys DMX rather
    // than running an internal auto/sound program (CH7 0-5 = manual RGBW).
    id: 'rgbw-strobe-panel-11ch',
    name: 'RGB Strobe Panel (11ch: D/R/G/B/W/Strobe, manual mode)',
    kind: 'strobe',
    channels: [
      { role: 'dimmer' },
      ...rgbw(),
      { role: 'strobe', strobeOpen: 0, strobeRange: { min: 8, max: 255 } },
      { role: 'static', staticValue: 0 }, // Ch7 Effect Mode: hold in manual RGBW
      { role: 'static', staticValue: 0 }, // Ch8 Effect Select (unused in manual)
      { role: 'static', staticValue: 0 }, // Ch9 Effect Speed
      { role: 'static', staticValue: 0 }, // Ch10 White Auto Effect: disabled
      { role: 'static', staticValue: 0 } // Ch11 White Effect Speed
    ]
  },
  {
    // Hi-res RGB strobe panel in its 165ch "console" mode: 45 RGB pixels then
    // 30 separate white LEDs. Modeled as 75 segments (pixels 0-44 RGB, 45-74
    // white), so effects like Side Sweep get fine resolution and Rainbow +
    // Strobe rainbows the pixels while flashing the white LEDs.
    id: 'rgb-white-panel-165ch',
    name: 'RGB+White Pixel Panel (165ch: 45 RGB + 30 White)',
    kind: 'strobe',
    channels: [
      ...Array.from({ length: 45 }, (_, i) => rgb(i)).flat(),
      ...Array.from({ length: 30 }, (_, i): ChannelSpec => ({ role: 'white', segment: 45 + i }))
    ]
  },

  // ---- Moving heads ----
  {
    id: 'generic-moving-head-8ch',
    name: 'Moving Head Wash (8ch: Pan/Tilt/Speed/D/R/G/B/Strobe)',
    kind: 'movingHead',
    channels: [
      { role: 'pan' },
      { role: 'tilt' },
      { role: 'speed', staticValue: 0 },
      { role: 'dimmer' },
      ...rgb(),
      STROBE
    ]
  },
  {
    id: 'generic-moving-head-11ch',
    name: 'Moving Head Spot (11ch: Pan/PanF/Tilt/TiltF/Speed/D/Strobe/Color/Gobo/Mode/Speed2)',
    kind: 'movingHead',
    channels: [
      { role: 'pan' },
      { role: 'panFine' },
      { role: 'tilt' },
      { role: 'tiltFine' },
      { role: 'speed', staticValue: 0 },
      { role: 'dimmer' },
      STROBE,
      { role: 'colorWheel' },
      { role: 'gobo' },
      { role: 'mode', staticValue: 0 },
      { role: 'speed', staticValue: 0 }
    ]
  },
  {
    id: 'generic-moving-wash-14ch',
    name: 'Moving Head Wash RGBW (14ch: Pan/PanF/Tilt/TiltF/Speed/D/Strobe/R/G/B/W/Mode/Auto/Reset)',
    kind: 'movingHead',
    channels: [
      { role: 'pan' },
      { role: 'panFine' },
      { role: 'tilt' },
      { role: 'tiltFine' },
      { role: 'speed', staticValue: 0 },
      { role: 'dimmer' },
      STROBE,
      ...rgbw(),
      { role: 'mode', staticValue: 0 },
      { role: 'mode', staticValue: 0 },
      { role: 'mode', staticValue: 0 }
    ]
  },
  {
    id: 'generic-beam-9ch',
    name: 'Beam Moving Head (9ch: Pan/Tilt/Speed/Color/Gobo/Strobe/D/Auto/Reset)',
    kind: 'movingHead',
    channels: [
      { role: 'pan' },
      { role: 'tilt' },
      { role: 'speed', staticValue: 0 },
      { role: 'colorWheel' },
      { role: 'gobo' },
      STROBE,
      { role: 'dimmer' },
      { role: 'mode', staticValue: 0 },
      { role: 'mode', staticValue: 0 }
    ]
  },
  {
    id: 'generic-scanner-6ch',
    name: 'Mirror Scanner (6ch: Pan/Tilt/Color/Gobo/D/Strobe)',
    kind: 'scanner',
    channels: [
      { role: 'pan' },
      { role: 'tilt' },
      { role: 'colorWheel' },
      { role: 'gobo' },
      { role: 'dimmer' },
      STROBE
    ]
  },

  // ---- Multi-head bars ----
  {
    id: 'generic-moving-bar-5head-27ch',
    name: '5-Head Moving Beam Bar (27ch: D/Strobe + 5×Tilt + 5×RGBW) - Wave style',
    kind: 'movingBar',
    channels: [
      { role: 'dimmer' },
      STROBE,
      { role: 'tilt', segment: 0 },
      { role: 'tilt', segment: 1 },
      { role: 'tilt', segment: 2 },
      { role: 'tilt', segment: 3 },
      { role: 'tilt', segment: 4 },
      ...rgbw(0),
      ...rgbw(1),
      ...rgbw(2),
      ...rgbw(3),
      ...rgbw(4)
    ]
  },
  {
    // 10 individually addressable RGBW pixels plus a single whole-bar tilt.
    // The app drives every pixel directly (chase / rainbow / running-light
    // effects run across the 10 cells, beat-synced), so it stays in the rich
    // 43ch mode rather than the fixture's fixed 7/13ch macro modes. Tilt speed
    // is pinned to 0 (instant) so the engine owns the movement; the reset
    // channel is pinned to 0 so a factory reset can never fire from a scene.
    id: 'rgbw-beam-bar-10px-43ch',
    name: '10-Pixel RGBW Beam Bar (43ch: Tilt/Speed + 10×RGBW + Reset)',
    kind: 'movingBar',
    channels: [
      { role: 'tilt' },
      { role: 'speed', staticValue: 0 },
      ...Array.from({ length: 10 }, (_, i) => rgbw(i)).flat(),
      { role: 'static', staticValue: 0 }
    ]
  },
  {
    id: 'generic-pixel-bar-8seg-26ch',
    name: 'LED Pixel Bar 8 Segments (26ch: D/Strobe + 8×RGB)',
    kind: 'bar',
    channels: [
      { role: 'dimmer' },
      STROBE,
      ...rgb(0),
      ...rgb(1),
      ...rgb(2),
      ...rgb(3),
      ...rgb(4),
      ...rgb(5),
      ...rgb(6),
      ...rgb(7)
    ]
  },
  {
    id: 'generic-pixel-bar-4seg-14ch',
    name: 'LED Wash Bar 4 Segments (14ch: D/Strobe + 4×RGB)',
    kind: 'bar',
    channels: [{ role: 'dimmer' }, STROBE, ...rgb(0), ...rgb(1), ...rgb(2), ...rgb(3)]
  },

  // ---- Effects ----
  {
    id: 'generic-derby-6ch',
    name: 'Derby / Moonflower (6ch: D/R/G/B/Strobe/Rotation)',
    kind: 'derby',
    channels: [{ role: 'dimmer' }, ...rgb(), STROBE, { role: 'speed', staticValue: 190 }]
  },
  {
    id: 'generic-uv-2ch',
    name: 'UV Cannon (2ch: UV Dimmer/Strobe)',
    kind: 'uv',
    channels: [{ role: 'uv' }, STROBE]
  },
  {
    id: 'generic-laser-2ch',
    name: 'Laser (2ch: On-Off/Pattern)',
    kind: 'laser',
    channels: [
      { role: 'onOff', onValue: 255 }, // lit by scenes; 0 = off
      { role: 'gobo' } // pattern select
    ]
  },
  {
    id: 'generic-laser-3ch',
    name: 'Laser (3ch: On-Off/Pattern/Speed)',
    kind: 'laser',
    channels: [{ role: 'onOff', onValue: 255 }, { role: 'gobo' }, { role: 'speed', staticValue: 128 }]
  },
  {
    id: 'generic-fog-1ch',
    name: 'Fog Machine (1ch: Output)',
    kind: 'fog',
    channels: [{ role: 'dimmer' }]
  }
]

export function builtinFixturesById(): Map<string, FixtureDefinition> {
  return new Map(BUILTIN_FIXTURES.map((f) => [f.id, f]))
}

/** Builtins plus a project's custom profiles (custom wins on id collision). */
export function fixturesById(custom: FixtureDefinition[] = []): Map<string, FixtureDefinition> {
  const map = builtinFixturesById()
  for (const fixture of custom) map.set(fixture.id, fixture)
  return map
}
