import {
  errorResult,
  findEntityByRef,
  getPack,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawBurg,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface BurgPortRef {
  i: number;
  name: string;
  cell: number;
  x: number;
  y: number;
  group: string;
  previousEnabled: boolean;
}

export interface BurgPortEnableResult {
  port: number;
  haven: boolean;
}

export interface BurgPortRuntime {
  find(ref: number | string): BurgPortRef | null;
  enable(ref: BurgPortRef): BurgPortEnableResult;
  disable(ref: BurgPortRef): void;
}

interface PackWithCells {
  burgs?: RawBurg[];
  cells?: {
    haven?: ArrayLike<number>;
    f?: ArrayLike<number>;
  };
}

export const defaultBurgPortRuntime: BurgPortRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawBurg>("burgs"), ref);
    if (!entry) return null;
    if (entry.i <= 0) return null;
    if (entry.removed) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      cell: entry.cell ?? 0,
      x: entry.x ?? 0,
      y: entry.y ?? 0,
      group: entry.group ?? "cities",
      previousEnabled: !!entry.port,
    };
  },
  enable(ref) {
    const pack = getPack<PackWithCells>();
    const burgs = pack?.burgs;
    const burg = burgs?.[ref.i];
    if (!burg) throw new Error(`Burg ${ref.i} not found.`);
    const haven = pack?.cells?.haven?.[ref.cell] ?? 0;
    const portFeature = haven ? (pack?.cells?.f?.[haven] ?? -1) : -1;
    burg.port = portFeature;

    if (typeof document !== "undefined") {
      const anchorsRoot = document.getElementById("anchors");
      const target = anchorsRoot?.querySelector(`#${ref.group}`) ?? anchorsRoot;
      if (target) {
        const use = document.createElementNS(SVG_NS, "use");
        use.setAttribute("href", "#icon-anchor");
        use.setAttribute("id", `anchor${ref.i}`);
        use.setAttribute("data-id", String(ref.i));
        use.setAttribute("x", String(ref.x));
        use.setAttribute("y", String(ref.y));
        target.appendChild(use);
      }
    }

    return { port: portFeature, haven: !!haven };
  },
  disable(ref) {
    const burgs = getPackCollection<RawBurg>("burgs");
    const burg = burgs?.[ref.i];
    if (!burg) throw new Error(`Burg ${ref.i} not found.`);
    burg.port = 0;

    if (typeof document !== "undefined") {
      const existing = document.querySelector(`#anchors [data-id='${ref.i}']`);
      existing?.remove();
    }
  },
};

export function createSetBurgPortTool(
  runtime: BurgPortRuntime = defaultBurgPortRuntime,
): Tool {
  return {
    name: "set_burg_port",
    description:
      "Toggle a burg's port status — same side-effect as the Port button in the Burg Editor. Enabling looks up the burg's coastal haven (pack.cells.haven[burg.cell]) and writes burg.port = pack.cells.f[haven] (the sea feature id) or -1 if no haven exists. It also appends an anchor glyph (<use href=\"#icon-anchor\">) under #anchors #<burg.group>. Disabling writes burg.port = 0 and removes the anchor glyph. No-haven enable returns ok with a warning (matches the UI's warn-and-proceed behavior). Idempotent.",
    input_schema: {
      type: "object",
      properties: {
        burg: {
          type: ["integer", "string"],
          description: "Numeric burg id (> 0) or current name.",
        },
        enabled: {
          type: "boolean",
          description: "true to mark the burg as a port, false to clear it.",
        },
      },
      required: ["burg", "enabled"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        burg?: unknown;
        enabled?: unknown;
      };

      const refResult = parseEntityRef(input.burg, "burg");
      if (!refResult.ok) return errorResult(refResult.error);

      if (typeof input.enabled !== "boolean") {
        return errorResult("enabled must be a boolean.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No burg found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (current.previousEnabled === input.enabled) {
        return okResult({
          i: current.i,
          name: current.name,
          enabled: input.enabled,
          previousEnabled: current.previousEnabled,
          port: input.enabled ? -1 : 0,
          noop: true,
        });
      }

      try {
        if (input.enabled) {
          const { port, haven } = runtime.enable(current);
          const payload: Record<string, unknown> = {
            i: current.i,
            name: current.name,
            enabled: true,
            previousEnabled: false,
            port,
            noop: false,
          };
          if (!haven) {
            payload.warning = "No coastal haven available; port set to -1.";
          }
          return okResult(payload);
        }
        runtime.disable(current);
        return okResult({
          i: current.i,
          name: current.name,
          enabled: false,
          previousEnabled: true,
          port: 0,
          noop: false,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const setBurgPortTool = createSetBurgPortTool();
