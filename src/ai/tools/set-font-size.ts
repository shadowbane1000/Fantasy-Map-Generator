import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { FONT_LAYERS, type FontLayerSpec } from "./set-font-family";

// `set_font_size` targets the same text-bearing SVG groups as
// `set_font_family`; reuse the FONT_LAYERS table it exports.
//
// The Style Editor's font-size handler (`changeFontSize` in
// `public/modules/ui/style.js`) writes both `data-size` (the user-authored
// size, preserved across zoom-driven rescaling) and `font-size` (the
// currently rendered size). We mirror that so the next
// `invokeActiveZooming` / reGraph pass sees a consistent `data-size`.

const ALL_TARGETS: readonly FontLayerSpec[] = [
  FONT_LAYERS[0], // labels
  FONT_LAYERS[4], // province_labels
  FONT_LAYERS[5], // legend
];

const LOOKUP = new Map<string, FontLayerSpec>();
for (const spec of FONT_LAYERS) {
  LOOKUP.set(spec.canonical.toLowerCase(), spec);
  for (const alias of spec.aliases) LOOKUP.set(alias.toLowerCase(), spec);
}

// Matches the HTML input bounds in `src/index.html` (`#styleFontSize`):
// `type="number" min=".5" max="100" step=".1"`.
export const FONT_SIZE_MIN = 0.5;
export const FONT_SIZE_MAX = 100;

export interface FontSizeRuntime {
  readFontSize(svgId: string): number | null;
  setFontSize(svgId: string, size: number): void;
}

function parseSize(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

export const defaultFontSizeRuntime: FontSizeRuntime = {
  readFontSize(svgId: string): number | null {
    if (typeof document === "undefined") return null;
    const el = document.getElementById(svgId);
    if (!el) return null;
    // Prefer `data-size` (the user-authored size the Style Editor round-trips
    // through `styleFontSize.value`). Fall back to `font-size` when
    // `data-size` hasn't been initialised yet.
    const fromData = parseSize(el.getAttribute("data-size"));
    if (fromData !== null) return fromData;
    return parseSize(el.getAttribute("font-size"));
  },
  setFontSize(svgId: string, size: number): void {
    if (typeof document === "undefined") {
      throw new Error("document is not available.");
    }
    const el = document.getElementById(svgId);
    if (!el) {
      throw new Error(`Layer element #${svgId} not found in DOM.`);
    }
    const str = String(size);
    el.setAttribute("data-size", str);
    el.setAttribute("font-size", str);
  },
};

function supportedLayerList(): string[] {
  return [...FONT_LAYERS.map((l) => l.canonical), "all"];
}

export function createSetFontSizeTool(
  runtime: FontSizeRuntime = defaultFontSizeRuntime,
): Tool {
  return {
    name: "set_font_size",
    description:
      `Set the \`font-size\` of a text-bearing SVG layer group — the ` +
      `same side-effect as the Style Editor's font-size slider ` +
      `(\`styleFontSize.on("change", …)\` → \`changeFontSize\`). Writes the ` +
      `\`data-size\` and \`font-size\` attributes on the layer's \`<g>\`; ` +
      `child \`<text>\` / \`<textPath>\` inherit \`font-size\`. Supported ` +
      `layers: \`labels\` (#labels, the root text group — affects every ` +
      `label sub-group that hasn't overridden its own size), ` +
      `\`state_labels\` (#states), \`added_labels\` (#addedLabels — ` +
      `custom user labels), \`burg_labels\` (#burgLabels), ` +
      `\`province_labels\` (#provs), \`legend\` (#legend), or \`all\` ` +
      `which applies to #labels, #provs, and #legend. \`size\` is a ` +
      `number in [${FONT_SIZE_MIN}, ${FONT_SIZE_MAX}] (matches the UI ` +
      `slider's \`min=.5 max=100 step=.1\`). Returns ` +
      `{ok, layer, previousSize, size} and, for 'all', an \`applied\` ` +
      `array of per-layer previous values.`,
    input_schema: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description:
            "Layer group to resize. One of: 'labels', 'state_labels', " +
            "'added_labels', 'burg_labels', 'province_labels', 'legend', " +
            "or 'all'. Common aliases like 'state labels', 'burg labels', " +
            "'province labels', 'provinces' are also accepted.",
        },
        size: {
          type: "number",
          minimum: FONT_SIZE_MIN,
          maximum: FONT_SIZE_MAX,
          description:
            `Font size in [${FONT_SIZE_MIN}, ${FONT_SIZE_MAX}] (the same ` +
            `range as the Style Editor's font-size input). Typical map ` +
            `label sizes are 6–20.`,
        },
      },
      required: ["layer", "size"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        layer?: unknown;
        size?: unknown;
      };

      if (typeof input.layer !== "string" || !input.layer.trim()) {
        return errorResult("layer must be a non-empty string.", {
          supported: supportedLayerList(),
        });
      }
      if (
        typeof input.size !== "number" ||
        !Number.isFinite(input.size) ||
        input.size < FONT_SIZE_MIN ||
        input.size > FONT_SIZE_MAX
      ) {
        return errorResult(
          `size must be a finite number in [${FONT_SIZE_MIN}, ${FONT_SIZE_MAX}].`,
        );
      }

      const size = input.size;
      const key = input.layer.trim().toLowerCase();

      if (key === "all") {
        const applied: Array<{
          layer: string;
          svgId: string;
          previousSize: number | null;
        }> = [];
        for (const spec of ALL_TARGETS) {
          const previousSize = runtime.readFontSize(spec.svgId);
          try {
            runtime.setFontSize(spec.svgId, size);
          } catch (err) {
            return errorResult(
              err instanceof Error ? err.message : String(err),
              { appliedBeforeError: applied },
            );
          }
          applied.push({
            layer: spec.canonical,
            svgId: spec.svgId,
            previousSize,
          });
        }
        return okResult({
          layer: "all",
          previousSize: applied[0]?.previousSize ?? null,
          size,
          applied,
        });
      }

      const entry = LOOKUP.get(key);
      if (!entry) {
        return errorResult(`Unknown layer: ${input.layer}`, {
          supported: supportedLayerList(),
        });
      }

      const previousSize = runtime.readFontSize(entry.svgId);

      try {
        runtime.setFontSize(entry.svgId, size);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        layer: entry.canonical,
        previousSize,
        size,
      });
    },
  };
}

export const setFontSizeTool = createSetFontSizeTool();
