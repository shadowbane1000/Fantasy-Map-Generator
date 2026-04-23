import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

// Maps a canonical layer name to the SVG `<g>` id whose `font-family`
// attribute the Style Editor mutates (see `public/modules/ui/style.js`
// `changeFont` + `getEl`, and `src/modules/fonts.ts` `getUsedFonts`). Child
// `<text>` / `<textPath>` inherit this attribute, so writing it on the
// group is enough — no redraw needed.
export interface FontLayerSpec {
  canonical: string;
  svgId: string;
  aliases: string[];
}

export const FONT_LAYERS: readonly FontLayerSpec[] = [
  {
    canonical: "labels",
    svgId: "labels",
    aliases: ["labels", "all labels", "map labels", "label"],
  },
  {
    canonical: "state_labels",
    svgId: "states",
    aliases: ["state_labels", "state labels", "states labels", "states"],
  },
  {
    canonical: "added_labels",
    svgId: "addedLabels",
    aliases: ["added_labels", "added labels", "custom labels", "addedlabels"],
  },
  {
    canonical: "burg_labels",
    svgId: "burgLabels",
    aliases: [
      "burg_labels",
      "burg labels",
      "burgs labels",
      "city labels",
      "burglabels",
    ],
  },
  {
    canonical: "province_labels",
    svgId: "provs",
    aliases: [
      "province_labels",
      "province labels",
      "provinces labels",
      "provinces",
      "provs",
    ],
  },
  {
    canonical: "legend",
    svgId: "legend",
    aliases: ["legend"],
  },
] as const;

// `"all"` is a pseudo-layer: applies the change to the three root font-
// bearing groups (`#labels`, `#provs`, `#legend`) that `getUsedFonts`
// enumerates in `src/modules/fonts.ts`.
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

export interface FontFamilyRuntime {
  readFontFamily(svgId: string): string | null;
  setFontFamily(svgId: string, font: string): void;
}

export const defaultFontFamilyRuntime: FontFamilyRuntime = {
  readFontFamily(svgId: string): string | null {
    if (typeof document === "undefined") return null;
    const el = document.getElementById(svgId);
    if (!el) return null;
    const v = el.getAttribute("font-family");
    return v === null || v === "" ? null : v;
  },
  setFontFamily(svgId: string, font: string): void {
    if (typeof document === "undefined") {
      throw new Error("document is not available.");
    }
    const el = document.getElementById(svgId);
    if (!el) {
      throw new Error(`Layer element #${svgId} not found in DOM.`);
    }
    el.setAttribute("font-family", font);
  },
};

function supportedLayerList(): string[] {
  return [...FONT_LAYERS.map((l) => l.canonical), "all"];
}

export function createSetFontFamilyTool(
  runtime: FontFamilyRuntime = defaultFontFamilyRuntime,
): Tool {
  return {
    name: "set_font_family",
    description:
      `Set the \`font-family\` of a text-bearing SVG layer group — the ` +
      `same side-effect as the Style Editor's font picker ` +
      `(\`styleSelectFont.on("change", …)\`). Writes the \`font-family\` ` +
      `attribute on the layer's \`<g>\`; child \`<text>\` / \`<textPath>\` ` +
      `inherit it. Supported layers: \`labels\` (#labels, the root text ` +
      `group — affects every label sub-group that hasn't overridden its ` +
      `own font), \`state_labels\` (#states), \`added_labels\` ` +
      `(#addedLabels — custom user labels), \`burg_labels\` (#burgLabels), ` +
      `\`province_labels\` (#provs), \`legend\` (#legend), or \`all\` ` +
      `which applies to #labels, #provs, and #legend (the three groups ` +
      `\`getUsedFonts\` collects from). Pass \`font\` as the CSS ` +
      `font-family string (e.g. 'Almendra SC', 'Garamond', 'Forum'). ` +
      `Returns {ok, layer, previousFont, font} and, for 'all', an ` +
      `\`applied\` array of per-layer previous values.`,
    input_schema: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description:
            "Layer group to re-font. One of: 'labels', 'state_labels', " +
            "'added_labels', 'burg_labels', 'province_labels', 'legend', " +
            "or 'all'. Common aliases like 'state labels', 'burg labels', " +
            "'province labels', 'provinces' are also accepted.",
        },
        font: {
          type: "string",
          description:
            "Font family name — any CSS font-family string (e.g. " +
            "'Almendra SC', 'Garamond', 'Forum'). The font must already be " +
            "loaded (add it via the Style Editor's custom-font dialog or " +
            "load a default preset first).",
        },
      },
      required: ["layer", "font"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        layer?: unknown;
        font?: unknown;
      };

      if (typeof input.layer !== "string" || !input.layer.trim()) {
        return errorResult("layer must be a non-empty string.", {
          supported: supportedLayerList(),
        });
      }
      if (typeof input.font !== "string" || !input.font.trim()) {
        return errorResult("font must be a non-empty string.");
      }

      const font = input.font;
      const key = input.layer.trim().toLowerCase();

      if (key === "all") {
        const applied: Array<{
          layer: string;
          svgId: string;
          previousFont: string | null;
        }> = [];
        for (const spec of ALL_TARGETS) {
          const previousFont = runtime.readFontFamily(spec.svgId);
          try {
            runtime.setFontFamily(spec.svgId, font);
          } catch (err) {
            return errorResult(
              err instanceof Error ? err.message : String(err),
              { appliedBeforeError: applied },
            );
          }
          applied.push({
            layer: spec.canonical,
            svgId: spec.svgId,
            previousFont,
          });
        }
        return okResult({
          layer: "all",
          previousFont: applied[0]?.previousFont ?? null,
          font,
          applied,
        });
      }

      const entry = LOOKUP.get(key);
      if (!entry) {
        return errorResult(`Unknown layer: ${input.layer}`, {
          supported: supportedLayerList(),
        });
      }

      const previousFont = runtime.readFontFamily(entry.svgId);

      try {
        runtime.setFontFamily(entry.svgId, font);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        layer: entry.canonical,
        previousFont,
        font,
      });
    },
  };
}

export const setFontFamilyTool = createSetFontFamilyTool();
