import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Loose shape of an entry in `options.burgs.groups`. Only the fields
 * this tool reads or writes are typed; everything else is preserved
 * as-is via the index signature.
 */
export interface SetBurgGroupDefaultGroup {
  name?: unknown;
  isDefault?: unknown;
  [key: string]: unknown;
}

interface BurgGroupsOptionsLike {
  burgs?: { groups?: unknown };
}

/**
 * Runtime-injection seam for `set_burg_group_default`. Tests pass a
 * fake; the default reads `window.options.burgs.groups` and writes
 * `localStorage["burg-groups"]`, matching `burg-group-editor.js`.
 */
export interface SetBurgGroupDefaultRuntime {
  /**
   * Returns the live array reference so the tool can mutate
   * `isDefault` in place — same pattern as the legacy editor's
   * submitForm. Returns undefined when `options.burgs.groups` is
   * missing or not an array.
   */
  getGroups(): SetBurgGroupDefaultGroup[] | undefined;
  /**
   * Persists the entire groups array to backing storage. Throws when
   * storage is unavailable; the tool catches and reports
   * `persisted: false` rather than failing the whole call.
   */
  persist(groups: SetBurgGroupDefaultGroup[]): void;
}

export const defaultSetBurgGroupDefaultRuntime: SetBurgGroupDefaultRuntime = {
  getGroups() {
    const options = getGlobal<BurgGroupsOptionsLike>("options");
    const groups = options?.burgs?.groups;
    return Array.isArray(groups)
      ? (groups as SetBurgGroupDefaultGroup[])
      : undefined;
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
 * Find the names of every group currently flagged `isDefault: true`.
 * Returns null (none), a single string (normal), or an array of names
 * (anomalous input — multiple flagged true). Used to populate the
 * `previous_default` field in the response.
 */
export function findPreviousDefault(
  groups: SetBurgGroupDefaultGroup[],
): string | string[] | null {
  const flagged: string[] = [];
  for (const g of groups) {
    if (!g) continue;
    if (g.isDefault === true) {
      flagged.push(typeof g.name === "string" ? g.name : "");
    }
  }
  if (flagged.length === 0) return null;
  if (flagged.length === 1) return flagged[0];
  return flagged;
}

/**
 * Apply "exactly one default" by setting the named group's
 * `isDefault` to true and every other group's to false. Mutates in
 * place. Returns `{ changed }` indicating whether any field actually
 * differed from its prior value.
 *
 * Comparing on the name field rather than the array index lets a
 * caller pre-mutate the array without breaking us; comparing strict
 * equal to true / false (rather than truthy / falsy) means we
 * normalize stray non-boolean isDefault values too.
 */
export function applyDefault(
  groups: SetBurgGroupDefaultGroup[],
  name: string,
): { changed: boolean } {
  let changed = false;
  for (const g of groups) {
    if (!g) continue;
    const wantTrue = g.name === name;
    const desired = wantTrue;
    if (g.isDefault !== desired) {
      g.isDefault = desired;
      changed = true;
    }
  }
  return { changed };
}

interface SetBurgGroupDefaultInput {
  name?: unknown;
}

export function createSetBurgGroupDefaultTool(
  runtime: SetBurgGroupDefaultRuntime = defaultSetBurgGroupDefaultRuntime,
): Tool {
  return {
    name: "set_burg_group_default",
    description:
      'Promote a single burg group to the default fallback in `options.burgs.groups` — the AI equivalent of clicking the `isDefault` radio in the Burg Groups Editor (`public/modules/ui/burg-group-editor.js`) and clicking Apply. Sets `isDefault: true` on the named group and `isDefault: false` on every other group, replicating the editor\'s `<input type="radio" name="isDefault">` exactly-one-checked semantic. Self-heals anomalous input (multiple groups already flagged default): the response\'s `previous_default` field reports what was found — null (none), a single name (normal), or an array of names (multiple). After the in-memory mutation succeeds, persists via `localStorage.setItem("burg-groups", JSON.stringify(options.burgs.groups))` matching the editor\'s storage key. localStorage being unavailable is a soft failure (`persisted: false`, plus a note); the in-memory state is still updated. Match is **case-sensitive** on `name` — use `list_burg_groups` to discover exact names.',
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Exact (case-sensitive) `name` of the burg group to make default.",
        },
      },
      required: ["name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as SetBurgGroupDefaultInput;

      if (typeof input.name !== "string" || input.name.trim() === "") {
        return errorResult("name must be a non-empty string.");
      }
      const name = input.name;

      const groups = runtime.getGroups();
      if (!groups) {
        return errorResult("options.burgs.groups is missing or not an array.");
      }

      const target = groups.find((g) => g && g.name === name);
      if (!target) {
        return errorResult(`Burg group ${JSON.stringify(name)} not found.`);
      }

      const previousDefault = findPreviousDefault(groups);
      const { changed } = applyDefault(groups, name);

      if (!changed) {
        return okResult({
          name,
          previous_default: previousDefault,
          changed: false,
        });
      }

      try {
        runtime.persist(groups);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return okResult({
          name,
          previous_default: previousDefault,
          changed: true,
          persisted: false,
          note: `Persist failed: ${message}`,
        });
      }

      return okResult({
        name,
        previous_default: previousDefault,
        changed: true,
        persisted: true,
      });
    },
  };
}

export const setBurgGroupDefaultTool = createSetBurgGroupDefaultTool();
