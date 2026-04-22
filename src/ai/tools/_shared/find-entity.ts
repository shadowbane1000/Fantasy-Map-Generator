export interface EntityLike {
  i: number;
  name?: string;
  fullName?: string;
  removed?: boolean;
}

export function isActive(
  e: { i: number; removed?: boolean } | null | undefined,
): boolean {
  return !!e && e.i > 0 && !e.removed;
}

/**
 * Find a pack-style collection entry by numeric id or by case-insensitive
 * `name` / `fullName`. Skips the index-0 placeholder and `removed: true`
 * entries in both paths. Returns the raw entry so callers can format it
 * however they need.
 */
export function findEntityByRef<T extends EntityLike>(
  entries: T[] | undefined,
  ref: number | string,
): T | null {
  if (!entries) return null;
  if (typeof ref === "number") {
    if (!Number.isInteger(ref) || ref <= 0) return null;
    const e = entries[ref];
    return e && !e.removed ? e : null;
  }
  if (typeof ref !== "string") return null;
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  for (const e of entries) {
    if (!isActive(e)) continue;
    if ((e.name ?? "").toLowerCase() === needle) return e;
    if ((e.fullName ?? "").toLowerCase() === needle) return e;
  }
  return null;
}
