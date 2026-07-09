import type { Scene } from './types'

/**
 * Ready-to-play vibe presets targeting 'all' fixtures, so a fresh install
 * makes light immediately after patching — no editing required. Users can
 * duplicate/tweak these in the scene editor.
 */
export const PRESET_SCENES: Scene[] = [
  {
    id: 'preset-warm-house',
    name: 'Warm House',
    uiColor: '#f59e0b',
    targets: [
      {
        group: 'all',
        color: { r: 255, g: 120, b: 20 },
        dimmer: 0.85,
        effect: { type: 'beatPulse' }
      }
    ]
  },
  {
    id: 'preset-deep-blue',
    name: 'Deep & Blue',
    uiColor: '#3b82f6',
    targets: [
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
    ]
  },
  {
    id: 'preset-peak-time',
    name: 'Peak Time',
    uiColor: '#ef4444',
    targets: [
      {
        group: 'all',
        color: { r: 255, g: 0, b: 0 },
        dimmer: 1,
        effect: {
          type: 'chase',
          beats: 1,
          colors: [
            { r: 255, g: 0, b: 0 },
            { r: 255, g: 255, b: 255 },
            { r: 255, g: 0, b: 180 }
          ]
        }
      }
    ]
  },
  {
    id: 'preset-rainbow-flow',
    name: 'Rainbow Flow',
    uiColor: '#8b5cf6',
    targets: [{ group: 'all', color: { r: 255, g: 0, b: 0 }, dimmer: 0.8, effect: { type: 'rainbow', beats: 16 } }]
  },
  {
    id: 'preset-bass-reactor',
    name: 'Bass Reactor',
    uiColor: '#22c55e',
    targets: [
      {
        group: 'all',
        color: { r: 255, g: 255, b: 255, w: 255 },
        dimmer: 1,
        effect: { type: 'bassPulse' }
      }
    ]
  },
  {
    id: 'preset-audio-glow',
    name: 'Audio Glow',
    uiColor: '#14b8a6',
    targets: [
      {
        group: 'all',
        color: { r: 0, g: 220, b: 180 },
        dimmer: 1,
        effect: { type: 'audioLevel' }
      }
    ]
  },
  {
    id: 'preset-sunset',
    name: 'Sunset',
    uiColor: '#ec4899',
    targets: [
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
    ]
  },
  {
    id: 'preset-whiteout-strobe',
    name: 'Whiteout Strobe',
    uiColor: '#f2f2f5',
    targets: [
      {
        group: 'all',
        color: { r: 255, g: 255, b: 255, w: 255 },
        dimmer: 1,
        effect: { type: 'strobe' }
      }
    ]
  }
]
