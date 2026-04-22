export type EntityRef = number | string;

export type ParseEntityRefResult =
  | { ok: true; ref: EntityRef }
  | { ok: false; error: string };

/**
 * Validate an entity ref as either a positive integer id or a non-empty
 * name string. Returns a discriminated union so callers can forward the
 * error message via `errorResult`.
 */
export function parseEntityRef(
  value: unknown,
  fieldName: string,
): ParseEntityRefResult {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return { ok: true, ref: value };
  }
  if (typeof value === "string" && value.trim()) {
    return { ok: true, ref: value };
  }
  return {
    ok: false,
    error: `${fieldName} must be a positive integer id or a non-empty name string.`,
  };
}
