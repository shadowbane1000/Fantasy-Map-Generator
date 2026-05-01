import { sanitizeId } from "../../utils/stringUtils";
import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Loose shape of an entry in `options.burgs.groups`. Only the fields
 * the tool reads or writes are typed; the rest are preserved as-is
 * via the index signature.
 */
export interface AddBurgGroupGroup {
  name?: unknown;
  order?: unknown;
  active?: unknown;
  isDefault?: unknown;
  [key: string]: unknown;
}

interface BurgGroupsOptionsLike {
  burgs?: { groups?: unknown };
}

/**
 * Runtime-injection seam for `add_burg_group`. Tests pass a fake; the
 * default reads `window.options.burgs.groups` and writes
 * `localStorage["burg-groups"]`, matching `burg-group-editor.js`.
 */
export interface AddBurgGroupRuntime {
  /**
   * Returns the live array reference so the tool can append in place.
   * Returns undefined when `options.burgs.groups` is missing or not
   * an array.
   */
  getGroups(): AddBurgGroupGroup[] | undefined;
  /**
   * Persists the entire groups array to backing storage. Throws when
   * storage is unavailable; the tool catches and reports
   * `persisted: false` rather than failing the whole call.
   */
  persist(groups: AddBurgGroupGroup[]): void;
}

export const defaultAddBurgGroupRuntime: AddBurgGroupRuntime = {
  getGroups() {
    const options = getGlobal<BurgGroupsOptionsLike>("options");
    const groups = options?.burgs?.groups;
    return Array.isArray(groups) ? (groups as AddBurgGroupGroup[]) : undefined;
  },
  persist(groups) {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    if (!storage) {
      throw new Error("localStorage is not available.");
    }
    storage.setItem("burg-groups", JSON.stringify(groups));
  },
};

/**
 * Compute the default `order` for a new group: max of existing finite
 * numeric orders, plus one. Falls back to 1 if no group has a finite
 * numeric order. Mirrors the editor's "rendering order: higher values
 * are rendered on top" semantic.
 */
export function computeDefaultOrder(groups: AddBurgGroupGroup[]): number {
  let max = 0;
  let any = false;
  for (const g of groups) {
    if (!g) continue;
    const o = g.order;
    if (typeof o === "number" && Number.isFinite(o) && o > max) {
      max = o;
      any = true;
    } else if (typeof o === "number" && Number.isFinite(o)) {
      any = true;
    }
  }
  return any ? max + 1 : 1;
}

/**
 * Returns true iff at least one entry in `groups` currently has
 * `isDefault === true`. Used to decide whether to emit the
 * "no group is currently default" advisory note when the caller
 * doesn't promote the new group themselves.
 */
export function hasExistingDefault(groups: AddBurgGroupGroup[]): boolean {
  for (const g of groups) {
    if (!g) continue;
    if (g.isDefault === true) return true;
  }
  return false;
}

/**
 * Clear `isDefault` on every group whose flag is currently truthy.
 * Mutates in place. Returns the number of groups whose flag changed —
 * not used by the tool, but handy for tests.
 */
export function clearAllDefaults(groups: AddBurgGroupGroup[]): number {
  let cleared = 0;
  for (const g of groups) {
    if (!g) continue;
    if (g.isDefault === true) {
      g.isDefault = false;
      cleared++;
    }
  }
  return cleared;
}

interface AddBurgGroupInput {
  name?: unknown;
  order?: unknown;
  active?: unknown;
  preview?: unknown;
  min?: unknown;
  max?: unknown;
  percentile?: unknown;
  biomes?: unknown;
  states?: unknown;
  cultures?: unknown;
  religions?: unknown;
  features?: unknown;
  is_default?: unknown;
}

function isPositiveInteger(v: unknown): v is number {
  return (
    typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v > 0
  );
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function createAddBurgGroupTool(
  runtime: AddBurgGroupRuntime = defaultAddBurgGroupRuntime,
): Tool {
  return {
    name: "add_burg_group",
    description:
      'Append a new burg group config to `options.burgs.groups` — the AI equivalent of clicking "Add" in the Configure Burg Groups dialog (`public/modules/ui/burg-group-editor.js`), filling the row, and clicking Apply. Sanitizes `name` via `sanitizeId` (lowercase, trim, drop chars outside `[a-z0-9-_]`, prefix `_` if leading digit) — same rule the editor\'s `submitForm` applies. Note: `sanitizeId` STRIPS spaces (they\'re outside `[a-z0-9-_]`), it does not convert them to hyphens; so `"Marsh towns"` → `"marshtowns"`. Rejects empty post-sanitize names and collisions on the sanitized name. The new group always gets `name`, `order`, and `active`; other optional fields (`preview`, `min`, `max`, `percentile`, `biomes`, `states`, `cultures`, `religions`, `features`) are included only when supplied — same null-stripping behaviour as the editor\'s `submitForm`. Default `order` is `(max existing order) + 1` (or 1 if none); default `active` is true. When `is_default: true`, sets `isDefault: true` on the new group and `false` on every existing group (mirrors `set_burg_group_default`). DIVERGENCE FROM EDITOR: this tool is a primitive — it does NOT auto-promote the new group to default just because no existing group was flagged default. If `is_default !== true` and no group was previously default, the response includes `note: "No group is currently set as default. Call set_burg_group_default to set one."`. Persists via `localStorage.setItem("burg-groups", JSON.stringify(options.burgs.groups))` (best-effort; `persisted: true|false` in result).',
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
          description:
            "Desired group name. Sanitized via `sanitizeId` (lowercase, drop chars outside `[a-z0-9-_]`, prefix `_` on leading digits). Spaces are STRIPPED, not hyphenated. Must produce a non-empty result and not collide with any existing group's `name`.",
        },
        order: {
          type: "integer",
          minimum: 1,
          description:
            "Rendering order; higher values draw on top. Positive integer. Defaults to `(max existing order) + 1` (or 1 if no existing finite numeric order).",
        },
        active: {
          type: "boolean",
          description:
            "Whether the group is active. Default true. Inactive groups don't receive new burgs from `Burgs.defineGroup`.",
        },
        preview: {
          type: "string",
          description:
            'Burg preview generator id. The editor exposes "watabou-city", "watabou-village", "watabou-dwelling", or empty. Pass-through; no validation beyond "must be string".',
        },
        min: {
          type: "number",
          description: "Population min constraint (population points).",
        },
        max: {
          type: "number",
          description: "Population max constraint (population points).",
        },
        percentile: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description:
            "Population percentile constraint, 0-100. 90 means the burg's population must be higher than 90% of all burgs.",
        },
        biomes: {
          type: "string",
          description:
            'Comma-separated allowed biome ids (e.g. "1,2,4"). Empty/absent means all biomes allowed.',
        },
        states: {
          type: "string",
          description:
            "Comma-separated allowed state ids. Empty/absent means all states allowed.",
        },
        cultures: {
          type: "string",
          description:
            "Comma-separated allowed culture ids. Empty/absent means all cultures allowed.",
        },
        religions: {
          type: "string",
          description:
            "Comma-separated allowed religion ids. Empty/absent means all religions allowed.",
        },
        features: {
          type: "object",
          description:
            'Feature limitation map. Keys are burg features ("capital", "port", "citadel", "walls", "plaza", "temple", "shanty"); values are booleans (true=must have, false=must not have). Missing key means "any".',
        },
        is_default: {
          type: "boolean",
          description:
            "When true, set this group as the default fallback (clearing isDefault on all other groups). Default false.",
        },
      },
      required: ["name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as AddBurgGroupInput;

      // --- Validate `name` ---
      if (typeof input.name !== "string" || input.name.trim() === "") {
        return errorResult("name must be a non-empty string.");
      }

      // sanitizeId throws on empty; we already checked, but guard anyway.
      let sanitized: string;
      try {
        sanitized = sanitizeId(input.name);
      } catch {
        return errorResult("name must be a non-empty string.");
      }
      if (sanitized === "") {
        return errorResult("name sanitizes to an empty string.");
      }

      // --- Validate optional fields (when supplied) ---
      let order: number | undefined;
      if (input.order !== undefined && input.order !== null) {
        if (!isPositiveInteger(input.order)) {
          return errorResult("order must be a positive integer.");
        }
        order = input.order;
      }

      let active = true;
      if (input.active !== undefined && input.active !== null) {
        if (typeof input.active !== "boolean") {
          return errorResult("active must be a boolean.");
        }
        active = input.active;
      }

      let preview: string | undefined;
      if (input.preview !== undefined && input.preview !== null) {
        if (typeof input.preview !== "string") {
          return errorResult("preview must be a string.");
        }
        preview = input.preview;
      }

      let min: number | undefined;
      if (input.min !== undefined && input.min !== null) {
        if (!isFiniteNumber(input.min)) {
          return errorResult("min must be a finite number.");
        }
        min = input.min;
      }

      let max: number | undefined;
      if (input.max !== undefined && input.max !== null) {
        if (!isFiniteNumber(input.max)) {
          return errorResult("max must be a finite number.");
        }
        max = input.max;
      }

      let percentile: number | undefined;
      if (input.percentile !== undefined && input.percentile !== null) {
        if (!isFiniteNumber(input.percentile)) {
          return errorResult("percentile must be a finite number.");
        }
        if (input.percentile < 0 || input.percentile > 100) {
          return errorResult("percentile must be between 0 and 100.");
        }
        percentile = input.percentile;
      }

      let biomes: string | undefined;
      if (input.biomes !== undefined && input.biomes !== null) {
        if (typeof input.biomes !== "string") {
          return errorResult("biomes must be a string.");
        }
        biomes = input.biomes;
      }

      let states: string | undefined;
      if (input.states !== undefined && input.states !== null) {
        if (typeof input.states !== "string") {
          return errorResult("states must be a string.");
        }
        states = input.states;
      }

      let cultures: string | undefined;
      if (input.cultures !== undefined && input.cultures !== null) {
        if (typeof input.cultures !== "string") {
          return errorResult("cultures must be a string.");
        }
        cultures = input.cultures;
      }

      let religions: string | undefined;
      if (input.religions !== undefined && input.religions !== null) {
        if (typeof input.religions !== "string") {
          return errorResult("religions must be a string.");
        }
        religions = input.religions;
      }

      let features: Record<string, unknown> | undefined;
      if (input.features !== undefined && input.features !== null) {
        if (!isPlainObject(input.features)) {
          return errorResult("features must be an object.");
        }
        features = { ...input.features };
      }

      let isDefault = false;
      if (input.is_default !== undefined && input.is_default !== null) {
        if (typeof input.is_default !== "boolean") {
          return errorResult("is_default must be a boolean.");
        }
        isDefault = input.is_default;
      }

      // --- Read live groups array ---
      const groups = runtime.getGroups();
      if (!groups) {
        return errorResult("options.burgs.groups is missing or not an array.");
      }

      // --- Collision check (case-sensitive on the SANITIZED name;
      //     since sanitizeId lowercases, this is effectively
      //     case-insensitive on the original input). ---
      for (const g of groups) {
        if (g && g.name === sanitized) {
          return errorResult(
            `Burg group ${JSON.stringify(sanitized)} already exists.`,
          );
        }
      }

      // --- Compute final order ---
      const finalOrder = order ?? computeDefaultOrder(groups);

      // --- Detect prior default state for the advisory note ---
      const priorHadDefault = hasExistingDefault(groups);

      // --- If is_default, clear other defaults FIRST ---
      if (isDefault) {
        clearAllDefaults(groups);
      }

      // --- Build the new group, mirroring the editor's null-strip ---
      const newGroup: AddBurgGroupGroup = {
        name: sanitized,
        order: finalOrder,
        active,
      };
      if (isDefault) newGroup.isDefault = true;
      if (preview !== undefined) newGroup.preview = preview;
      if (min !== undefined) newGroup.min = min;
      if (max !== undefined) newGroup.max = max;
      if (percentile !== undefined) newGroup.percentile = percentile;
      if (biomes !== undefined) newGroup.biomes = biomes;
      if (states !== undefined) newGroup.states = states;
      if (cultures !== undefined) newGroup.cultures = cultures;
      if (religions !== undefined) newGroup.religions = religions;
      if (features !== undefined) newGroup.features = features;

      // --- Append in place ---
      groups.push(newGroup);

      // --- Persist (best-effort) ---
      let persisted = true;
      let persistNote: string | undefined;
      try {
        runtime.persist(groups);
      } catch (err) {
        persisted = false;
        const message = err instanceof Error ? err.message : String(err);
        persistNote = `Persist failed: ${message}`;
      }

      // --- Build the no-default advisory note ---
      let noDefaultNote: string | undefined;
      if (!isDefault && !priorHadDefault) {
        noDefaultNote =
          "No group is currently set as default. Call set_burg_group_default to set one.";
      }

      const body: Record<string, unknown> = {
        group: newGroup,
        persisted,
      };
      // Persist failure note takes precedence over the no-default
      // advisory: persistence is the more pressing problem.
      if (persistNote) {
        body.note = persistNote;
      } else if (noDefaultNote) {
        body.note = noDefaultNote;
      }

      return okResult(body);
    },
  };
}

export const addBurgGroupTool = createAddBurgGroupTool();
