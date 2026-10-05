/** Position for a song appended after the existing ones (gaps from removals are fine). */
export const nextPosition = (positions: ReadonlyArray<number>) => positions.reduce((max, p) => Math.max(max, p), -1) + 1

/**
 * A reorder must list every current item exactly once. A partial or duplicated
 * list (e.g. a stale tab after an add) would leave positions colliding.
 */
export function isPermutationOf(requested: ReadonlyArray<string>, current: ReadonlyArray<string>) {
  const set = new Set(requested)
  return set.size === requested.length && set.size === current.length && current.every((id) => set.has(id))
}
