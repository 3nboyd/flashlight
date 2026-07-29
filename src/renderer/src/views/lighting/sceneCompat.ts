import type { FixtureDefinition, FixturePatch } from '@core/lighting/fixtures/types'
import type { Scene } from '@core/lighting/engine/types'

/**
 * What the patched rig actually contains, so scenes can be checked for
 * compatibility: a scene that only drives fixture kinds you do not own (all
 * its targets are 'kind:laser' with no laser patched, say) produces nothing
 * and gets sorted into a "not compatible" bucket.
 */
export interface RigProfile {
  kinds: Set<string>
  groups: Set<string>
  hasFixtures: boolean
}

export function rigProfile(
  patches: FixturePatch[],
  defs: Map<string, FixtureDefinition>
): RigProfile {
  const kinds = new Set<string>()
  const groups = new Set<string>()
  for (const patch of patches) {
    const def = defs.get(patch.definitionId)
    if (def) kinds.add(def.kind)
    if (patch.group) groups.add(patch.group)
  }
  return { kinds, groups, hasFixtures: patches.length > 0 }
}

/** A scene is compatible if at least one target drives a fixture in the rig. */
export function sceneCompatible(scene: Scene, rig: RigProfile): boolean {
  if (!rig.hasFixtures) return true // nothing to compare against yet
  return scene.targets.some((target) => {
    if (target.group === 'all') return true
    if (target.group.startsWith('kind:')) return rig.kinds.has(target.group.slice(5))
    return rig.groups.has(target.group)
  })
}
