/**
 * Typed accessors for the legacy window globals this app relies on.
 * Centralises the awkward `globalThis` cast so tool files don't each
 * need to hand-roll it.
 */
export function getGlobal<T>(name: string): T | undefined {
  return (globalThis as Record<string, unknown>)[name] as T | undefined;
}

/**
 * Return the `window.pack` object typed as T. Every AI tool that
 * mutates or reads the world state goes through this.
 */
export function getPack<T = unknown>(): T | undefined {
  return getGlobal<T>("pack");
}

/**
 * Return a typed array collection from `window.pack`. Safely returns
 * undefined when pack or the collection is missing.
 */
export function getPackCollection<T>(key: string): T[] | undefined {
  const pack = getPack<Record<string, unknown>>();
  const value = pack?.[key];
  return Array.isArray(value) ? (value as T[]) : undefined;
}

/**
 * Return `window.notes` as an array (the global legend store keyed by
 * `id` strings like `marker{i}` or `burg{i}`). Returns undefined when
 * notes is missing or isn't an array.
 */
export function getNotes<T = unknown>(): T[] | undefined {
  const notes = getGlobal<unknown>("notes");
  return Array.isArray(notes) ? (notes as T[]) : undefined;
}
