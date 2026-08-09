import type { EffectType, Rgbw, Scene } from '@core/lighting/engine/types'

/**
 * Boils a scene down to a small animated-preview descriptor: which visual
 * family to animate and which colors to animate with. Used by SceneTile so
 * every tile *shows* what the scene does (a pulsing block, a moving rainbow,
 * a flashing strobe) instead of just naming it.
 */

export type PreviewKind = 'static' | 'pulse' | 'strobe' | 'cycle' | 'rainbow' | 'move'

export interface ScenePreview {
  kind: PreviewKind
  /** 1-3 CSS colors driving the animation. */
  colors: string[]
}

const KIND_OF: Record<EffectType, PreviewKind> = {
  static: 'static',
  beatPulse: 'pulse',
  breathe: 'pulse',
  eighthBuild: 'pulse',
  strike: 'pulse',
  tapPulse: 'strobe',
  sweep: 'move',
  audioLevel: 'pulse',
  bassPulse: 'pulse',
  colorCycle: 'cycle',
  randomColor: 'cycle',
  alternate: 'cycle',
  chase: 'cycle',
  solo: 'cycle',
  sparkle: 'cycle',
  rainbow: 'rainbow',
  rainbowStep: 'rainbow',
  strobe: 'strobe',
  eighthStrobe: 'strobe',
  movementCircle: 'move',
  movementSweep: 'move',
  movementFigure8: 'move',
  movementNod: 'move',
  movementRandom: 'move'
}

/** Higher wins when a scene layers several effects: pick the most eye-catching. */
const PRIORITY: Record<PreviewKind, number> = {
  rainbow: 5,
  strobe: 4,
  cycle: 3,
  move: 2,
  pulse: 1,
  static: 0
}

function rgbToCss(c: Rgbw): string {
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`
}

export function scenePreview(scene: Scene): ScenePreview {
  let bestKind: PreviewKind = 'static'
  let bestColors: string[] = [scene.uiColor]
  let chose = false
  for (const target of scene.targets) {
    const kind = target.effect ? KIND_OF[target.effect.type] : 'static'
    if (!chose || PRIORITY[kind] > PRIORITY[bestKind]) {
      const palette =
        target.effect?.colors && target.effect.colors.length > 0 ? target.effect.colors : [target.color]
      bestKind = kind
      bestColors = palette.map(rgbToCss)
      chose = true
    }
  }
  const colors = Array.from(new Set(bestColors)).slice(0, 3)
  return { kind: bestKind, colors: colors.length > 0 ? colors : [scene.uiColor] }
}
