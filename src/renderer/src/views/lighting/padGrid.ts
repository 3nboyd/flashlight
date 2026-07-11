/** Column count for each supported pad grid size, tuned to stay roughly square. */
export function padColumns(padCount: number): number {
  if (padCount <= 8) return 4
  if (padCount <= 16) return 4
  if (padCount <= 32) return 8
  return 8
}

/** Grows/shrinks the pad-scene array to exactly `count`, keeping assignments. */
export function resizePadArray(pads: (string | null)[], count: number): (string | null)[] {
  const next = pads.slice(0, count)
  while (next.length < count) next.push(null)
  return next
}
