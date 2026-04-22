/**
 * Build a case-insensitive resolver that maps canonical values or alias
 * strings to a canonical value of type T. Returns null for unknown or
 * non-string inputs. Matching is whitespace-flexible (leading/trailing
 * whitespace is trimmed).
 */
export function createAliasResolver<T extends string>(
  canonical: readonly T[],
  extraAliases: Readonly<Record<string, T>> = {},
): (value: unknown) => T | null {
  const lookup = new Map<string, T>();
  for (const c of canonical) lookup.set(c.toLowerCase(), c);
  for (const [alias, target] of Object.entries(extraAliases)) {
    lookup.set(alias.trim().toLowerCase(), target);
  }
  return (value: unknown): T | null => {
    if (typeof value !== "string") return null;
    const key = value.trim().toLowerCase();
    if (!key) return null;
    return lookup.get(key) ?? null;
  };
}
