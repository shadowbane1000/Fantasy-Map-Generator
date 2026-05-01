import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Mirrors the sanitization pipeline used by `addGroup` in
 * `public/modules/ui/route-group-editor.js`:
 *
 *   v.toLowerCase()
 *    .replace(/ /g, "_")
 *    .replace(/[^\w\s]/gi, "");
 *
 * Pure — does not auto-prefix.
 */
export function sanitizeGroupName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ /g, "_")
    .replace(/[^\w\s]/gi, "");
}

/**
 * Appends the `route-` prefix when missing, mirroring the UI's
 * `if (!group.startsWith("route-")) group = "route-" + group;`.
 */
export function prefixWithRoute(s: string): string {
  return s.startsWith("route-") ? s : `route-${s}`;
}

export interface AddRouteGroupRuntime {
  /**
   * True iff a DOM element with the given id already exists.
   * Mirrors `byId(group)` in the UI.
   */
  idExists(id: string): boolean;
  /**
   * Append a new `<g id={id} stroke="#000000" stroke-width="0.5"
   * stroke-dasharray="1 0.5" stroke-linecap="butt">` to the
   * `#routes` SVG layer (D3 `routes` selection on `window`).
   * The four attrs are fixed in the implementation to mirror the UI
   * 1:1; callers cannot vary them.
   */
  appendGroup(id: string): void;
  /**
   * Append `<option value=value>value</option>` to the `<select>`
   * with the given id, when the element exists. Soft-skips when
   * absent (the chat tool can be invoked outside the Routes Editor
   * flow).
   */
  appendSelectOption(selectId: string, value: string): void;
}

interface D3SelectionLike {
  attr(name: string, value: string | number): D3SelectionLike;
}

interface D3RoutesLike {
  append(name: string): D3SelectionLike;
}

interface OptionsCollectionLike {
  add(opt: unknown): void;
}

interface SelectLike {
  options?: OptionsCollectionLike;
}

function buildOption(value: string): unknown {
  // Prefer the global Option constructor (browser & happy-dom). Fall
  // back to document.createElement so the tool still works in
  // environments where Option isn't a global.
  const OptionCtor = (
    globalThis as unknown as {
      Option?: new (text: string, value: string) => unknown;
    }
  ).Option;
  if (typeof OptionCtor === "function") {
    return new OptionCtor(value, value);
  }
  if (typeof document !== "undefined") {
    const opt = document.createElement("option") as unknown as {
      value: string;
      textContent: string;
    };
    opt.value = value;
    opt.textContent = value;
    return opt;
  }
  // Last resort plain object — `select.options.add` will throw, but
  // that's caught by the tool and surfaced as an error.
  return { value, text: value };
}

export const defaultAddRouteGroupRuntime: AddRouteGroupRuntime = {
  idExists(id: string): boolean {
    if (typeof document === "undefined") return false;
    return document.getElementById(id) != null;
  },
  appendGroup(id: string): void {
    const routes = getGlobal<D3RoutesLike>("routes");
    if (!routes || typeof routes.append !== "function") {
      throw new Error("window.routes (D3 selection) is unavailable.");
    }
    routes
      .append("g")
      .attr("id", id)
      .attr("stroke", "#000000")
      .attr("stroke-width", 0.5)
      .attr("stroke-dasharray", "1 0.5")
      .attr("stroke-linecap", "butt");
  },
  appendSelectOption(selectId: string, value: string): void {
    if (typeof document === "undefined") return;
    const el = document.getElementById(
      selectId,
    ) as unknown as SelectLike | null;
    if (!el || !el.options || typeof el.options.add !== "function") return;
    el.options.add(buildOption(value));
  },
};

export function createAddRouteGroupTool(
  runtime: AddRouteGroupRuntime = defaultAddRouteGroupRuntime,
): Tool {
  return {
    name: "add_route_group",
    description: `Create a new route group container (<g> element) under the #routes SVG layer — same side-effect as the Route Groups Editor "Add" button (route-group-editor.js → addGroup). Sanitizes the user-supplied name (lowercase, spaces→underscores, strips non-\\w/\\s chars), auto-prefixes "route-" when missing, rejects empty/numeric-leading/colliding ids, then appends <g id=<sanitized> stroke="#000000" stroke-width="0.5" stroke-dasharray="1 0.5" stroke-linecap="butt"/> to the routes layer. Also appends an <option> to #routeGroup and #routeCreatorGroupSelect when those <select>s exist (soft-skip when not). This only creates the group container — it does not move existing routes; use set_route_group for that.`,
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
          description:
            'Human-friendly group name. Will be lowercased, spaces converted to underscores, and non-word characters stripped. The "route-" prefix is added automatically when missing. Final id must not collide with an existing element.',
        },
      },
      required: ["name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { name?: unknown };

      if (typeof input.name !== "string" || input.name.trim().length === 0) {
        return errorResult("name must be a non-empty string.");
      }

      const sanitized = sanitizeGroupName(input.name);
      if (sanitized.length === 0) {
        return errorResult("Invalid group name (sanitized to empty).");
      }

      const id = prefixWithRoute(sanitized);

      if (Number.isFinite(Number(id.charAt(0)))) {
        return errorResult("Group name must start with a letter.");
      }

      if (runtime.idExists(id)) {
        return errorResult(`Element with id ${id} already exists.`);
      }

      try {
        runtime.appendGroup(id);
        runtime.appendSelectOption("routeGroup", id);
        runtime.appendSelectOption("routeCreatorGroupSelect", id);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ id });
    },
  };
}

export const addRouteGroupTool = createAddRouteGroupTool();
