import type { Scene, SceneCategory } from '@core/lighting/engine/types'

/** Display order and labels for the four scene buckets, plus custom scenes. */
export const SCENE_CATEGORY_ORDER: SceneCategory[] = [
  'normal',
  'build',
  'flash',
  'peak',
  'adaptive',
  'experimental'
]

export const SCENE_CATEGORY_LABEL: Record<SceneCategory, string> = {
  normal: 'Normals',
  build: 'Builds',
  flash: 'Flashing',
  peak: 'Peaks',
  adaptive: 'Adaptive',
  experimental: 'Experimental (Beta)'
}

export interface SceneGroup {
  key: SceneCategory | 'other'
  label: string
  scenes: Scene[]
}

/**
 * Groups scenes into the four buckets in a stable order, with any
 * uncategorized (custom) scenes collected under "Custom". Empty buckets are
 * dropped so pickers only show columns that have something in them.
 */
export function groupScenesByCategory(scenes: Scene[]): SceneGroup[] {
  const groups: SceneGroup[] = SCENE_CATEGORY_ORDER.map((key) => ({
    key,
    label: SCENE_CATEGORY_LABEL[key],
    scenes: []
  }))
  const other: SceneGroup = { key: 'other', label: 'Custom', scenes: [] }
  for (const scene of scenes) {
    const group = scene.category ? groups.find((g) => g.key === scene.category) : undefined
    ;(group ?? other).scenes.push(scene)
  }
  return [...groups, other].filter((g) => g.scenes.length > 0)
}
