import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Loose shape for one entry in `options.burgs.groups`. The legacy
 * editor compacts groups by stripping null-valued fields, so any
 * field may be absent. We only read `name` and `active` here.
 */
interface BurgGroupLike {
  name?: unknown;
  active?: unknown;
}

interface BurgsOptionsLike {
  burgs?: { groups?: unknown };
}

/**
 * Mirror of `list-burg-groups.ts`'s `mapBurgGroup` strict-bool rule:
 * only literal `true` counts as active. Missing field, truthy-non-bool,
 * etc. all count as inactive.
 */
function isActiveBool(g: BurgGroupLike | null | undefined): boolean {
  return !!g && g.active === true;
}

/**
 * Runtime seam — separates the live `options.burgs.groups` read from
 * the best-effort localStorage write so tests can inject either.
 */
export interface SetBurgGroupActiveRuntime {
  /**
   * Returns the live array. Implementations are expected to return
   * the actual reference held by `window.options.burgs.groups`; the
   * tool mutates entries in place.
   * Returns whatever's there — `unknown` so the tool can validate.
   */
  getGroups(): unknown;
  /**
   * Best-effort persistence. MUST NOT throw — return `false` if the
   * write was skipped or failed. The default impl swallows storage
   * quota / security / `localStorage`-undefined exceptions.
   */
  persist(groups: unknown[]): boolean;
}

export const defaultSetBurgGroupActiveRuntime: SetBurgGroupActiveRuntime = {
  getGroups(): unknown {
    const options = getGlobal<BurgsOptionsLike>("options");
    return options?.burgs?.groups;
  },
  persist(groups: unknown[]): boolean {
    try {
      const ls = (globalThis as { localStorage?: Storage }).localStorage;
      if (!ls) return false;
      ls.setItem("burg-groups", JSON.stringify(groups));
      return true;
    } catch {
      return false;
    }
  },
};

interface SetBurgGroupActiveInput {
  name?: unknown;
  active?: unknown;
}

export function createSetBurgGroupActiveTool(
  runtime: SetBurgGroupActiveRuntime = defaultSetBurgGroupActiveRuntime,
): Tool {
  return {
    name: "set_burg_group_active",
    description:
      "Toggle the `active` flag on one entry in `options.burgs.groups`, mirroring the per-row 'Activate/deactivate group' checkbox in the legacy Burg Groups Editor (`burg-group-editor.js`). Inputs: `name` (case-sensitive group id) and `active` (boolean new value). Validates the editor's invariant that at least one group must remain active — deactivating the last active group is rejected. After a successful change, mirrors the editor's persistence by calling `localStorage.setItem(\"burg-groups\", JSON.stringify(options.burgs.groups))` (best-effort; the result reports `persisted: true|false`). NOTE: this tool does NOT migrate burgs the way the legacy 'Apply' button does — it does not invoke `Burgs.defineGroup`, so `pack.burgs[i].group` strings are left untouched. To re-bin burgs, regenerate or use other AI tools.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Exact case-sensitive `name` (id) of the group in `options.burgs.groups`.",
        },
        active: {
          type: "boolean",
          description: "New value of the group's `active` flag.",
        },
      },
      required: ["name", "active"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as SetBurgGroupActiveInput;

      if (typeof input.name !== "string" || input.name.trim() === "") {
        return errorResult("name must be a non-empty string.");
      }
      if (typeof input.active !== "boolean") {
        return errorResult("active must be a boolean.");
      }

      const name = input.name;
      const next = input.active;

      const rawGroups = runtime.getGroups();
      if (!Array.isArray(rawGroups)) {
        return errorResult("options.burgs.groups is missing or not an array.");
      }
      const groups = rawGroups as BurgGroupLike[];

      const target = groups.find(
        (g) => g != null && (g as BurgGroupLike).name === name,
      );
      if (!target) {
        return errorResult(
          `No burg group found with name ${JSON.stringify(name)}.`,
        );
      }

      const oldActive = isActiveBool(target);

      // No-op short-circuits BEFORE the last-active check. A no-op
      // false→false on the only "previously active" group is fine —
      // we're not changing state. The legacy editor's invariant only
      // fires when the user actually toggles an active row off.
      if (oldActive === next) {
        return okResult({
          name,
          old_active: oldActive,
          new_active: next,
          changed: false,
        });
      }

      // Last-active rule: deactivating an active group requires that
      // at least one OTHER group is currently active.
      if (next === false) {
        let otherActive = 0;
        for (const g of groups) {
          if (g === target) continue;
          if (isActiveBool(g as BurgGroupLike)) otherActive++;
        }
        if (otherActive === 0) {
          return errorResult("Cannot deactivate the last active group.");
        }
      }

      // Mutate in place — `groups` is the live array reference.
      target.active = next;

      const persisted = runtime.persist(groups);
      const body: Record<string, unknown> = {
        name,
        old_active: oldActive,
        new_active: next,
        changed: true,
        persisted,
      };
      if (!persisted) {
        body.note =
          "localStorage write skipped or failed; in-memory mutation applied.";
      }
      return okResult(body);
    },
  };
}

export const setBurgGroupActiveTool = createSetBurgGroupActiveTool();
