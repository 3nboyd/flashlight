import type { FixtureDefinition } from './types'

/**
 * Built-in generic fixture profiles. These match the de-facto channel
 * layouts that the vast majority of budget/DJ fixtures ship with (and that
 * fixtures' "basic" DMX modes emulate). Users can pick the closest profile;
 * a custom fixture editor is on the roadmap.
 *
 * Laser profiles are deliberately minimal (on/off + pattern) — laser
 * movement/zoning is intentionally left to the fixture's own auto/sound
 * mode for safety reasons; audience-scanning control from generic software
 * is not something we want to encourage.
 */
export const BUILTIN_FIXTURES: FixtureDefinition[] = [
  {
    id: 'generic-dimmer-1ch',
    name: 'Generic Dimmer (1ch)',
    kind: 'dimmer',
    channels: [{ role: 'dimmer' }]
  },
  {
    id: 'generic-rgb-3ch',
    name: 'RGB Par (3ch)',
    kind: 'par',
    channels: [{ role: 'red' }, { role: 'green' }, { role: 'blue' }]
  },
  {
    id: 'generic-rgb-4ch',
    name: 'RGB Par + Dimmer (4ch)',
    kind: 'par',
    channels: [{ role: 'dimmer' }, { role: 'red' }, { role: 'green' }, { role: 'blue' }]
  },
  {
    id: 'generic-rgbw-8ch',
    name: 'RGBW Par (8ch: D/R/G/B/W/Strobe/Mode/Speed)',
    kind: 'par',
    channels: [
      { role: 'dimmer' },
      { role: 'red' },
      { role: 'green' },
      { role: 'blue' },
      { role: 'white' },
      { role: 'strobe', strobeOpen: 0, strobeRange: { min: 16, max: 255 } },
      { role: 'mode', staticValue: 0 },
      { role: 'speed', staticValue: 0 }
    ]
  },
  {
    id: 'generic-rgbaw-uv-6ch',
    name: 'RGBAW+UV Par (6ch)',
    kind: 'par',
    channels: [
      { role: 'red' },
      { role: 'green' },
      { role: 'blue' },
      { role: 'amber' },
      { role: 'white' },
      { role: 'uv' }
    ]
  },
  {
    id: 'generic-strobe-2ch',
    name: 'Strobe (2ch: Rate/Dimmer)',
    kind: 'strobe',
    channels: [
      { role: 'strobe', strobeOpen: 0, strobeRange: { min: 10, max: 255 } },
      { role: 'dimmer' }
    ]
  },
  {
    id: 'generic-laser-2ch',
    name: 'Laser (2ch: On-Off/Pattern)',
    kind: 'laser',
    channels: [
      { role: 'mode', staticValue: 0 }, // 0 = off; scenes set >0 to enable
      { role: 'gobo' } // pattern select
    ]
  },
  {
    id: 'generic-moving-head-8ch',
    name: 'Moving Head Wash (8ch: Pan/Tilt/Speed/D/R/G/B/Strobe)',
    kind: 'movingHead',
    channels: [
      { role: 'pan' },
      { role: 'tilt' },
      { role: 'speed', staticValue: 0 },
      { role: 'dimmer' },
      { role: 'red' },
      { role: 'green' },
      { role: 'blue' },
      { role: 'strobe', strobeOpen: 0, strobeRange: { min: 16, max: 255 } }
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
      { role: 'strobe', strobeOpen: 0, strobeRange: { min: 16, max: 255 } },
      { role: 'colorWheel' },
      { role: 'gobo' },
      { role: 'mode', staticValue: 0 },
      { role: 'speed', staticValue: 0 }
    ]
  }
]

export function builtinFixturesById(): Map<string, FixtureDefinition> {
  return new Map(BUILTIN_FIXTURES.map((f) => [f.id, f]))
}
