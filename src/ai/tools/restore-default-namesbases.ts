import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Per-entry shape we read out of the restored array. Only `name` is
 * consumed for the response payload — the rest of each entry is
 * passed through opaquely via the global reassignment (we never
 * inspect or transform it).
 */
export interface NamesbaseLike {
  name?: unknown;
}

export interface RestoreDefaultNamesbasesResult {
  previous_count: number;
  count: number;
  names: string[];
}

/**
 * Runtime-injection seam. The default implementation reads /
 * mutates `window.Names` and `window.nameBases` directly. Tests
 * inject a stub to exercise the call-order + error paths in
 * isolation.
 *
 * Important: `setNameBases` REASSIGNS the global binding (it does
 * `globalThis.nameBases = arr`). Mirroring the legacy editor's
 * `nameBases = Names.getNameBases()` semantics — NOT an in-place
 * mutation of an existing array.
 */
export interface RestoreDefaultNamesbasesRuntime {
  /**
   * Return the current `window.nameBases.length`, or `0` if the
   * global is missing or not an array. Called once, BEFORE
   * `clearChains`, so the reported `previous_count` reflects the
   * pre-restoration state.
   */
  countPrevious(): number;
  /**
   * Drop any cached Markov chains. Called BEFORE `getNameBases`
   * (matches legacy `namesbaseRestoreDefault` line 223-224
   * ordering).
   */
  clearChains(): void;
  /**
   * Return the bundled default namesbases array. Throws if the
   * `Names` global is missing, `getNameBases` is not callable, or
   * the return value isn't an array.
   */
  getNameBases(): unknown[];
  /**
   * Reassign `window.nameBases = arr`. Load-bearing: this is a
   * REPLACEMENT of the binding, not an in-place mutation.
   */
  setNameBases(arr: unknown[]): void;
}

interface NamesModuleLike {
  clearChains?: () => void;
  getNameBases?: () => unknown;
}

export const defaultRestoreDefaultNamesbasesRuntime: RestoreDefaultNamesbasesRuntime =
  {
    countPrevious(): number {
      const current = getGlobal<unknown>("nameBases");
      return Array.isArray(current) ? current.length : 0;
    },
    clearChains(): void {
      const mod = getGlobal<NamesModuleLike>("Names");
      if (!mod || typeof mod.clearChains !== "function") {
        throw new Error(
          "Names.clearChains is not available; the map hasn't finished loading.",
        );
      }
      mod.clearChains();
    },
    getNameBases(): unknown[] {
      const mod = getGlobal<NamesModuleLike>("Names");
      if (!mod || typeof mod.getNameBases !== "function") {
        throw new Error(
          "Names.getNameBases is not available; the map hasn't finished loading.",
        );
      }
      const result = mod.getNameBases();
      if (!Array.isArray(result)) {
        throw new Error("Names.getNameBases did not return an array.");
      }
      return result;
    },
    setNameBases(arr: unknown[]): void {
      (globalThis as Record<string, unknown>).nameBases = arr;
    },
  };

function entryName(entry: unknown): string {
  if (entry && typeof entry === "object") {
    const raw = (entry as NamesbaseLike).name;
    return typeof raw === "string" ? raw : "";
  }
  return "";
}

export function createRestoreDefaultNamesbasesTool(
  runtime: RestoreDefaultNamesbasesRuntime = defaultRestoreDefaultNamesbasesRuntime,
): Tool {
  return {
    name: "restore_default_namesbases",
    description:
      "Wipe any user-edited namesbases and reload the bundled default set — same side-effect as the Restore button in the Namesbase editor (namesbase-editor.js → namesbaseRestoreDefault). Calls Names.clearChains() to drop cached Markov chains, then reassigns window.nameBases = Names.getNameBases() (the default 26-entry corpus: German, English, French, Italian, …). Takes no arguments. Returns the previous count, the new count, and the list of restored namesbase names so you can immediately see what's available again.",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const previous_count = runtime.countPrevious();
      try {
        runtime.clearChains();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      let bases: unknown[];
      try {
        bases = runtime.getNameBases();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      runtime.setNameBases(bases);
      const names: string[] = [];
      for (const entry of bases) {
        names.push(entryName(entry));
      }
      return okResult({
        previous_count,
        count: bases.length,
        names,
      });
    },
  };
}

export const restoreDefaultNamesbasesTool =
  createRestoreDefaultNamesbasesTool();
