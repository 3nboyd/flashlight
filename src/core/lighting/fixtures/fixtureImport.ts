import type { ChannelRole, ChannelSpec, FixtureDefinition, FixtureKind } from './types'

/**
 * Imports a custom fixture from a pasted/loaded JSON description, so anyone can
 * add a light this app does not ship a profile for - by hand, or by pasting
 * the FIXTURE_AI_PROMPT plus their DMX manual into an AI chat and importing the
 * JSON it returns. Two shapes are accepted:
 *
 *  - explicit `channels`: the full ordered channel list (for movers, etc.)
 *  - `pixels`: a compact pixel-array shorthand that expands into segmented
 *    channels (for RGB/RGBW panels and bars), e.g.
 *      { "count": 45, "channels": ["red","green","blue"] }
 *
 * Everything is validated so a bad paste reports a clear error instead of
 * corrupting the rig.
 */

const ROLES: ChannelRole[] = [
  'dimmer',
  'red',
  'green',
  'blue',
  'white',
  'amber',
  'uv',
  'strobe',
  'pan',
  'tilt',
  'panFine',
  'tiltFine',
  'colorWheel',
  'gobo',
  'speed',
  'mode',
  'onOff',
  'static'
]

const KINDS: FixtureKind[] = [
  'par',
  'wash',
  'strobe',
  'movingHead',
  'laser',
  'dimmer',
  'bar',
  'movingBar',
  'derby',
  'scanner',
  'uv',
  'fog',
  'other'
]

export interface FixtureImportResult {
  fixture?: FixtureDefinition
  error?: string
}

function isRole(v: unknown): v is ChannelRole {
  return typeof v === 'string' && (ROLES as string[]).includes(v)
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'fixture'
}

function parseChannel(raw: unknown, index: number): ChannelSpec | string {
  if (typeof raw === 'string') {
    return isRole(raw) ? { role: raw } : `channel ${index + 1}: unknown role "${raw}"`
  }
  if (typeof raw !== 'object' || raw === null) return `channel ${index + 1}: must be a role name or object`
  const obj = raw as Record<string, unknown>
  if (!isRole(obj.role)) return `channel ${index + 1}: unknown or missing role "${String(obj.role)}"`
  const spec: ChannelSpec = { role: obj.role }
  if (typeof obj.segment === 'number') spec.segment = obj.segment
  if (typeof obj.staticValue === 'number') spec.staticValue = obj.staticValue
  if (typeof obj.onValue === 'number') spec.onValue = obj.onValue
  if (typeof obj.strobeOpen === 'number') spec.strobeOpen = obj.strobeOpen
  if (obj.strobeRange && typeof obj.strobeRange === 'object') {
    const r = obj.strobeRange as Record<string, unknown>
    if (typeof r.min === 'number' && typeof r.max === 'number') spec.strobeRange = { min: r.min, max: r.max }
  }
  return spec
}

function expandPixels(pixels: unknown): ChannelSpec[] | string {
  if (!Array.isArray(pixels)) return '"pixels" must be an array'
  const channels: ChannelSpec[] = []
  let segment = 0
  for (let g = 0; g < pixels.length; g++) {
    const group = pixels[g] as Record<string, unknown>
    const count = group?.count
    const roles = group?.channels
    if (typeof count !== 'number' || count < 1) return `pixels[${g}]: "count" must be a positive number`
    if (!Array.isArray(roles) || roles.length === 0) return `pixels[${g}]: "channels" must be a non-empty array`
    for (const role of roles) if (!isRole(role)) return `pixels[${g}]: unknown role "${String(role)}"`
    for (let i = 0; i < count; i++) {
      for (const role of roles) channels.push({ role: role as ChannelRole, segment })
      segment++
    }
  }
  return channels
}

export function parseFixtureImport(text: string): FixtureImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    return { error: `Not valid JSON: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (typeof data !== 'object' || data === null) return { error: 'Expected a JSON object.' }
  const obj = data as Record<string, unknown>

  if (typeof obj.name !== 'string' || obj.name.trim() === '') return { error: 'Missing "name".' }
  const kind = obj.kind
  if (!(typeof kind === 'string' && (KINDS as string[]).includes(kind))) {
    return { error: `"kind" must be one of: ${KINDS.join(', ')}.` }
  }

  let channels: ChannelSpec[]
  if (Array.isArray(obj.channels)) {
    const parsed: ChannelSpec[] = []
    for (let i = 0; i < obj.channels.length; i++) {
      const result = parseChannel(obj.channels[i], i)
      if (typeof result === 'string') return { error: result }
      parsed.push(result)
    }
    channels = parsed
  } else if (obj.pixels !== undefined) {
    const result = expandPixels(obj.pixels)
    if (typeof result === 'string') return { error: result }
    channels = result
  } else {
    return { error: 'Provide either "channels" (array) or "pixels" (array).' }
  }
  if (channels.length === 0) return { error: 'Fixture has no channels.' }

  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id : `custom-${slug(obj.name)}-${Date.now()}`
  return { fixture: { id, name: obj.name, kind: kind as FixtureKind, channels } }
}

/** Copyable prompt: paste into an AI chat with the fixture's DMX manual/photos. */
export const FIXTURE_AI_PROMPT = `You are converting a DMX lighting fixture's manual into a JSON profile for the Flashlight lighting app. I will give you the fixture's DMX chart (and maybe photos of the manual). Output ONLY a single JSON object, no prose, no markdown fences.

Schema:
{
  "name": "human name incl. the DMX mode, e.g. 'Moving Head (14ch)'",
  "kind": one of: par, wash, strobe, movingHead, movingBar, bar, laser, derby, scanner, uv, fog, dimmer, other,
  // Provide EITHER "channels" OR "pixels":
  "channels": [ one entry per DMX channel, IN ORDER ],
  "pixels": [ { "count": N, "channels": ["red","green","blue"] }, ... ]  // shorthand for pixel arrays
}

Each channel entry is a role string, or an object { "role": ..., ...options }. Valid roles:
- dimmer (master intensity), red, green, blue, white, amber, uv
- strobe  (use { "role":"strobe", "strobeOpen":0, "strobeRange":{"min":10,"max":255} })
- pan, tilt, panFine, tiltFine
- speed, colorWheel, gobo, mode  (channels the app should hold: add "staticValue": 0)
- onOff (lasers: { "role":"onOff", "onValue":255 }), static ({ "role":"static", "staticValue": 0 })

Rules:
- One entry per physical DMX channel, in the exact order of the chart.
- For multi-pixel fixtures (LED bars/panels), use "pixels": list each group of identical pixels with its count and per-pixel channel roles, in order. Example: 45 RGB pixels then 30 white LEDs -> [ {"count":45,"channels":["red","green","blue"]}, {"count":30,"channels":["white"]} ].
- If a fixture has control channels (dimmer, pan, tilt, effect selectors) AND pixels, use the explicit "channels" array instead, adding "segment": i (0-based) to each pixel's color channels.
- Pin any macro/effect/reset/mode channel to a safe value with "staticValue": 0 so it never triggers by itself.

Output the JSON now.`
