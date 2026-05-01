import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Loose shape of an entry in `options.burgs.groups`. Same pattern as
 * `set-burg-group-default.ts`: only the fields this tool reads or
 * writes are typed; everything else is preserved via the index
 * signature so we don't accidentally drop `preview`, `order`,
 * `biomes`, `colors`, etc. when round-tripping through localStorage.
 */
export interface RemoveBurgGroupGroup {
  name?: unknown;
  active?: unknown;
  isDefault?: unknown;
  [key: string]: unknown;
}

/**
 * Loose shape of an entry in `pack.burgs`. Most burg fields are
 * irrelevant here — we only read `group` and `removed` and write
 * `group` during migration.
 */
export interface RemoveBurgGroupBurg {
  group?: unknown;
  removed?: unknown;
  [key: string]: unknown;
}

interface BurgGroupsOptionsLike {
  burgs?: { groups?: unknown };
}

interface BurgsPackLike {
  burgs?: unknown;
}

/**
 * Runtime-injection seam for `remove_burg_group`. Tests pass a fake;
 * the default reads `window.options.burgs.groups`, `window.pack.burgs`,
 * and writes `localStorage["burg-groups"]`, matching the editor in
 * `public/modules/ui/burg-group-editor.js`.
 */
export interface RemoveBurgGroupRuntime {
  /**
   * Returns the live array reference so the tool can splice in place.
   * Returns undefined when `options.burgs.groups` is missing or not an
   * array.
   */
  getGroups(): RemoveBurgGroupGroup[] | undefined;
  /**
   * Returns the live `pack.burgs` array reference so the tool can
   * mutate `b.group` in place during migration. Returns undefined when
   * `pack.burgs` is missing or not an array — in which case the tool
   * skips the migration step (config-only change).
   */
  getBurgs(): RemoveBurgGroupBurg[] | undefined;
  /**
   * Persists the entire groups array to backing storage. Throws when
   * storage is unavailable; the tool catches and reports
   * `persisted: false` rather than failing the whole call.
   */
  persist(groups: RemoveBurgGroupGroup[]): void;
}

export const defaultRemoveBurgGroupRuntime: RemoveBurgGroupRuntime = {
  getGroups() {
    const options = getGlobal<BurgGroupsOptionsLike>("options");
    const groups = options?.burgs?.groups;
    return Array.isArray(groups)
      ? (groups as RemoveBurgGroupGroup[])
      : undefined;
  },
  getBurgs() {
    const pack = getPack<BurgsPackLike>();
    const burgs = pack?.burgs;
    return Array.isArray(burgs) ? (burgs as RemoveBurgGroupBurg[]) : undefined;
  },
  persist(groups) {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    if (!storage) {
      throw new Error("localStorage is not available.");
    }
    storage.setItem("burg-groups", JSON.stringify(groups));
  },
};

interface RemoveBurgGroupInput {
  name?: unknown;
}

/**
 * Promote a single survivor to be the unique `isDefault: true` group.
 * Mirrors the defensive style in `set-burg-group-default.ts` —
 * normalises any other survivor's `isDefault` to false.
 */
function setSoleDefault(
  survivors: RemoveBurgGroupGroup[],
  newDefault: RemoveBurgGroupGroup,
): void {
  for (const s of survivors) {
    if (!s) continue;
    s.isDefault = s === newDefault;
  }
}

export function createRemoveBurgGroupTool(
  runtime: RemoveBurgGroupRuntime = defaultRemoveBurgGroupRuntime,
): Tool {
  return {
    name: "remove_burg_group",
    description:
      "Delete one entry from `options.burgs.groups` — the AI equivalent of clicking the trash icon on a row in the Burg Groups Editor (`public/modules/ui/burg-group-editor.js#removeLine`) and clicking Apply. Validates the editor's invariants atomically before mutating: at least one group must remain, and at least one must remain `active: true`. If the removed group was the current default (`isDefault: true`), auto-promotes the first remaining group as the new default; the response's `new_default` field reports which group ended up as default. Migrates orphaned burgs: every `pack.burgs[i]` whose `group === <name>` (skipping `removed` burgs) is reassigned to the new-default group's `name`. After the in-memory mutation succeeds, persists via `localStorage.setItem(\"burg-groups\", JSON.stringify(options.burgs.groups))` matching the editor's storage key. localStorage being unavailable is a soft failure (`persisted: false`, plus a note); the in-memory state is still updated. Match is **case-sensitive** on `name` — use `list_burg_groups` to discover exact names.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Exact (case-sensitive) `name` of the burg group to remove.",
        },
      },
      required: ["name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as RemoveBurgGroupInput;

      if (typeof input.name !== "string" || input.name.trim() === "") {
        return errorResult("name must be a non-empty string.");
      }
      const name = input.name;

      const groups = runtime.getGroups();
      if (!groups) {
        return errorResult("options.burgs.groups is missing or not an array.");
      }

      const targetIndex = groups.findIndex((g) => g != null && g.name === name);
      if (targetIndex < 0) {
        return errorResult(`Burg group ${JSON.stringify(name)} not found.`);
      }
      const target = groups[targetIndex];

      if (groups.length < 2) {
        return errorResult("Cannot remove the last group.");
      }

      // "Last active" rule: if target is currently active and no
      // other group is active, removing it would leave zero actives.
      if (target.active === true) {
        let otherActive = 0;
        for (let i = 0; i < groups.length; i++) {
          if (i === targetIndex) continue;
          const g = groups[i];
          if (g != null && g.active === true) otherActive++;
        }
        if (otherActive === 0) {
          return errorResult(
            "Cannot remove the last active group; activate another first.",
          );
        }
      }

      // Snapshot the pre-removal config for audit / undo BEFORE we
      // touch any other field (e.g. self-healing isDefault below).
      const removed: RemoveBurgGroupGroup = { ...target };

      const survivors = groups.filter((_, i) => i !== targetIndex);

      // Determine the new default. Three cases:
      //   a) target was the default → promote survivors[0].
      //   b) survivors already have a single isDefault === true → use it.
      //   c) no survivor has isDefault === true → self-heal, promote
      //      survivors[0]. This also covers the (anomalous) case
      //      where multiple survivors are flagged default — we
      //      normalise to exactly one via setSoleDefault.
      let newDefault: RemoveBurgGroupGroup;
      if (target.isDefault === true) {
        newDefault = survivors[0];
        setSoleDefault(survivors, newDefault);
      } else {
        const existing = survivors.find(
          (g) => g != null && g.isDefault === true,
        );
        if (existing) {
          newDefault = existing;
          // Defensive: if multiple survivors are flagged default,
          // normalise.
          let flagged = 0;
          for (const s of survivors) {
            if (s != null && s.isDefault === true) flagged++;
          }
          if (flagged > 1) setSoleDefault(survivors, newDefault);
        } else {
          newDefault = survivors[0];
          setSoleDefault(survivors, newDefault);
        }
      }
      const newDefaultName =
        typeof newDefault.name === "string" ? newDefault.name : "";

      // Migrate orphaned burgs.
      let migratedBurgCount = 0;
      let migrationNote: string | undefined;
      const burgs = runtime.getBurgs();
      if (!burgs) {
        migrationNote = "pack.burgs unavailable; orphan reassignment skipped.";
      } else {
        for (const b of burgs) {
          if (!b) continue;
          if (b.removed === true) continue;
          if (b.group === name) {
            b.group = newDefaultName;
            migratedBurgCount++;
          }
        }
      }

      // Splice out the target.
      groups.splice(targetIndex, 1);

      // Persist. Best-effort.
      let persisted = true;
      let persistNote: string | undefined;
      try {
        runtime.persist(groups);
      } catch (err) {
        persisted = false;
        const message = err instanceof Error ? err.message : String(err);
        persistNote = `Persist failed: ${message}`;
      }

      const body: Record<string, unknown> = {
        name,
        removed,
        migrated_burg_count: migratedBurgCount,
        new_default: newDefaultName,
        changed: true,
        persisted,
      };
      const notes: string[] = [];
      if (migrationNote) notes.push(migrationNote);
      if (persistNote) notes.push(persistNote);
      if (notes.length > 0) body.note = notes.join(" ");
      return okResult(body);
    },
  };
}

export const removeBurgGroupTool = createRemoveBurgGroupTool();
