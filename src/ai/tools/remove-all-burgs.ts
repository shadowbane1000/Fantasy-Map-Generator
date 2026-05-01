import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawBurg,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Bulk-remove every non-locked, non-capital burg from the map — same
 * side-effect as the Burgs Overview's "Remove all" button
 * (`triggerAllBurgsRemove` in `public/modules/ui/burgs-overview.js`):
 *
 * ```js
 * function triggerAllBurgsRemove() {
 *   const number = pack.burgs.filter(b => b.i && !b.removed && !b.capital && !b.lock).length;
 *   confirmationDialog({
 *     title: `Remove ${number} burgs`,
 *     message: ...,
 *     confirm: "Remove",
 *     onConfirm: () => {
 *       pack.burgs.filter(b => b.i && !(b.capital || b.lock)).forEach(b => Burgs.remove(b.i));
 *       burgsOverviewAddLines();
 *     }
 *   });
 * }
 * ```
 *
 * Each removable burg is deleted via `Burgs.remove(i)`, which handles
 * DOM cleanup (icon, label, COA, emblem), `notes` pruning, and
 * `pack.cells.burg[burg.cell] = 0`. We tighten the legacy filter by
 * skipping pre-removed burgs (the legacy `forEach` would re-call
 * `Burgs.remove` on tombstones; harmless but noisy).
 *
 * Skip-bucket precedence: a burg that is BOTH a capital and locked is
 * counted under `skipped_capital` only. Capital is the primary
 * structural protection (must remove the state first); locking is
 * secondary.
 */

interface BurgPack {
  burgs?: RawBurg[];
}

interface BurgsModule {
  remove?: (id: number) => void;
}

export interface RemoveAllBurgsRuntime {
  /** Return `pack.burgs` if it's an array, otherwise undefined. */
  getBurgs(): RawBurg[] | undefined;
  /**
   * Delegate to `window.Burgs.remove(i)` (defined in
   * `src/modules/burgs-generator.ts`). Throws with the canonical
   * "window.Burgs.remove is not available" message when the global
   * isn't ready yet.
   */
  removeBurg(i: number): void;
  /** Best-effort: refresh the burgs overview list. Swallow errors. */
  addLines?(): void;
}

export const defaultRemoveAllBurgsRuntime: RemoveAllBurgsRuntime = {
  getBurgs(): RawBurg[] | undefined {
    const pack = getPack<BurgPack>();
    const burgs = pack?.burgs;
    return Array.isArray(burgs) ? burgs : undefined;
  },
  removeBurg(i: number): void {
    const burgsModule = getGlobal<BurgsModule>("Burgs");
    const remove = burgsModule?.remove;
    if (typeof remove !== "function") {
      throw new Error(
        "window.Burgs.remove is not available; the map hasn't finished loading.",
      );
    }
    remove(i);
  },
  addLines(): void {
    const fn = getGlobal<() => void>("burgsOverviewAddLines");
    if (typeof fn !== "function") return;
    try {
      fn();
    } catch {
      // best-effort: the burgs overview may not be open or may be
      // mid-mutation; never fail the tool because of it.
    }
  },
};

export function createRemoveAllBurgsTool(
  runtime: RemoveAllBurgsRuntime = defaultRemoveAllBurgsRuntime,
): Tool {
  return {
    name: "remove_all_burgs",
    description:
      "Bulk-remove every non-capital, non-locked burg from the map — same side-effect as the Burgs Overview's \"Remove all\" button (`triggerAllBurgsRemove` in `public/modules/ui/burgs-overview.js`). For each burg with `b.i && !b.removed && !b.capital && !b.lock`, calls `Burgs.remove(b.i)` (which marks `removed=true`, clears `pack.cells.burg[cell]`, prunes the `burg{i}` note, and removes the icon/label/COA/emblem SVG nodes). Capital burgs (`burg.capital === 1`) are PRESERVED — to remove a capital, reassign its state's capital first via `set_state_capital`, or remove the entire state via `remove_state`. Locked burgs (`burg.lock === true`) are PRESERVED — unlock with `set_entity_lock` or `toggle_lock_all_burgs` first. Skip-bucket precedence: a burg that is both capital AND locked counts under `skipped_capital`. Burg 0 (the placeholder) and pre-removed burgs are skipped silently. Best-effort calls `burgsOverviewAddLines()` once at the end. Destructive: there is no undo. No parameters. Returns `{ previous_count, removed_count, skipped_capital, skipped_locked, removed_burg_ids, removed_burg_ids_truncated }` where `removed_burg_ids` lists up to the first 50 removed ids in ascending order; `removed_burg_ids_truncated` is `true` when more than 50 burgs were removed.",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      let burgs: RawBurg[] | undefined;
      try {
        burgs = runtime.getBurgs();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      if (!Array.isArray(burgs)) {
        return errorResult(
          "window.pack.burgs is not available; the map hasn't finished loading.",
        );
      }

      let previous_count = 0;
      let skipped_capital = 0;
      let skipped_locked = 0;
      const targets: number[] = [];
      for (const burg of burgs) {
        if (!burg) continue;
        if (!burg.i) continue; // skip burg 0 placeholder
        if (burg.removed) continue; // tombstones don't count
        previous_count++;
        if (burg.capital) {
          // capital wins over locked
          skipped_capital++;
          continue;
        }
        if (burg.lock) {
          skipped_locked++;
          continue;
        }
        targets.push(burg.i);
      }

      const processedIds: number[] = [];
      try {
        for (const id of targets) {
          runtime.removeBurg(id);
          processedIds.push(id);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      if (typeof runtime.addLines === "function") {
        try {
          runtime.addLines();
        } catch {
          // best-effort.
        }
      }

      const sorted = [...processedIds].sort((a, b) => a - b);
      const truncated = sorted.length > 50;
      const removed_burg_ids = truncated ? sorted.slice(0, 50) : sorted;

      return okResult({
        previous_count,
        removed_count: processedIds.length,
        skipped_capital,
        skipped_locked,
        removed_burg_ids,
        removed_burg_ids_truncated: truncated,
      });
    },
  };
}

export const removeAllBurgsTool = createRemoveAllBurgsTool();
