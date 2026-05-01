import {
  errorResult,
  getGlobal,
  getNotes,
  getPack,
  isActive,
  okResult,
  type RawNote,
  type RawRegiment,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { type BurgPackLike, resolveStateRefInPack } from "./list-burgs";
import { findRegimentByRef } from "./rename-regiment";

interface MilitaryModule {
  generateNote?: (reg: RawRegiment, state: RawState) => void;
}

export interface RegenerateRegimentLegendStateRef {
  i: number;
  name: string;
}

export interface RegenerateRegimentLegendRegimentRef {
  i: number;
  name: string;
}

export interface RegenerateRegimentLegendNoteRef {
  id: string;
  name: string;
  legend: string;
}

export interface RegenerateRegimentLegendFound {
  state: RegenerateRegimentLegendStateRef;
  regiment: RegenerateRegimentLegendRegimentRef;
}

export interface RegenerateRegimentLegendRuntime {
  find(
    stateRef: number | string,
    regRef: number | string,
  ): RegenerateRegimentLegendFound | null;
  readNote(id: string): RegenerateRegimentLegendNoteRef | null;
  removeNote(id: string): void;
  regenerate(stateId: number, regimentI: number): void;
}

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

export const defaultRegenerateRegimentLegendRuntime: RegenerateRegimentLegendRuntime =
  {
    find(stateRef, regRef) {
      const pack = getPack<BurgPackLike>();
      const stateId = resolveStateRefInPack(pack, stateRef);
      if (stateId === null) return null;
      const state = pack?.states?.[stateId];
      if (!state || !isActive(state)) return null;
      const regiment = findRegimentByRef(state.military, regRef);
      if (!regiment) return null;
      return {
        state: { i: stateId, name: state.name ?? "" },
        regiment: { i: regiment.i, name: regiment.name ?? "" },
      };
    },
    readNote(id) {
      const notes = getNotes<RawNote>();
      const entry = notes?.find((n) => n?.id === id);
      if (!entry) return null;
      return {
        id,
        name: entry.name ?? "",
        legend: entry.legend ?? "",
      };
    },
    removeNote(id) {
      const notes = getNotes<RawNote>();
      if (!Array.isArray(notes)) {
        throw new Error(
          "window.notes is not available; the map hasn't finished loading.",
        );
      }
      const idx = notes.findIndex((n) => n?.id === id);
      if (idx >= 0) notes.splice(idx, 1);
    },
    regenerate(stateId, regimentI) {
      const military = getGlobal<MilitaryModule>("Military");
      if (!military || typeof military.generateNote !== "function") {
        throw new Error(
          "Military.generateNote is not available; the map hasn't finished loading.",
        );
      }
      const pack = getPack<BurgPackLike>();
      const state = pack?.states?.[stateId];
      if (!state) throw new Error(`State ${stateId} not found.`);
      const reg = findRegimentByRef(state.military, regimentI);
      if (!reg) {
        throw new Error(`Regiment ${regimentI} not found in state ${stateId}.`);
      }
      military.generateNote(reg as RawRegiment, state as RawState);
    },
  };

export function createRegenerateRegimentLegendTool(
  runtime: RegenerateRegimentLegendRuntime = defaultRegenerateRegimentLegendRuntime,
): Tool {
  return {
    name: "regenerate_regiment_legend",
    description:
      'Wipe and regenerate the procedural legend (note) attached to a single regiment — same side-effect as the Regiment Editor\'s "Regenerate Legend" button. Splices any existing `regiment{stateId}-{regimentI}` entry out of `window.notes`, then calls `Military.generateNote(reg, state)` which pushes a fresh procedural blurb (covers stationing burg/province, formation year, optional campaign name, and unit composition). Resolve the regiment via `(state, regiment)` pair (state by id incl. 0 or case-insensitive name/fullName; regiment by per-state regiment.i or case-insensitive name within that state). Distinct from `set_note` (which writes a user-supplied legend) and `regenerate_regiment_names` (which regenerates regiment NAMES, not their NOTES). Returns both the previous note (or null) and the new note (or null when generateNote silently no-ops).',
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Owning state — numeric id (0 is valid = Neutrals) or case-insensitive state name / fullName.",
        },
        regiment: {
          type: ["integer", "string"],
          description:
            "Numeric regiment id (regiment.i, per-state) or case-insensitive current regiment name within that state.",
        },
      },
      required: ["state", "regiment"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state?: unknown;
        regiment?: unknown;
      };

      if (!isValidRef(input.state)) {
        return errorResult(
          "state must be a non-negative integer id or a non-empty name string.",
        );
      }
      if (!isValidRef(input.regiment)) {
        return errorResult(
          "regiment must be a non-negative integer id or a non-empty name string.",
        );
      }

      const stateRef = input.state as number | string;
      const regRef = input.regiment as number | string;

      const found = runtime.find(stateRef, regRef);
      if (!found) {
        return errorResult(
          `No regiment found matching state=${JSON.stringify(stateRef)}, regiment=${JSON.stringify(regRef)}.`,
        );
      }

      const noteId = `regiment${found.state.i}-${found.regiment.i}`;

      let previousNote: RegenerateRegimentLegendNoteRef | null = null;
      try {
        previousNote = runtime.readNote(noteId);
      } catch {
        previousNote = null;
      }

      try {
        runtime.removeNote(noteId);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        runtime.regenerate(found.state.i, found.regiment.i);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      let newNote: RegenerateRegimentLegendNoteRef | null = null;
      try {
        newNote = runtime.readNote(noteId);
      } catch {
        newNote = null;
      }

      return okResult({
        state: found.state,
        regiment: found.regiment,
        note_id: noteId,
        previous_note: previousNote,
        note: newNote,
      });
    },
  };
}

export const regenerateRegimentLegendTool =
  createRegenerateRegimentLegendTool();
