/**
 * The photos for the Recent Photos rail, newest first. Normally the member's
 * newest `size` photos; when the viewed photo is older than those, a window
 * around it instead, so it's always in the rail. `newer` is oldest first and
 * `older` newest first, as photoNeighbors returns them.
 */
export function railWindow<T extends { rkey: string }>(
  recent: T[],
  current: T | null,
  newer: T[],
  older: T[],
  size: number,
): T[] {
  if (!current || recent.some((p) => p.rkey === current.rkey)) return recent;
  const slots = size - 1;
  // Prefer two newer photos above the current one, more if there aren't
  // enough older ones to fill the rest.
  const newerCount = Math.min(newer.length, Math.max(2, slots - older.length));
  const olderCount = Math.min(older.length, slots - newerCount);
  return [...newer.slice(0, newerCount).reverse(), current, ...older.slice(0, olderCount)];
}
