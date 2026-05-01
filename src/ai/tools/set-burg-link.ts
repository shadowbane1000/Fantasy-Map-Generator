import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawBurg,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface SetBurgLinkRef {
  i: number;
  name: string;
  previousLink: string | null;
}

export interface SetBurgLinkRuntime {
  find(ref: number | string): SetBurgLinkRef | null;
  apply(i: number, link: string | null): void;
}

function readPreviousLink(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export const defaultSetBurgLinkRuntime: SetBurgLinkRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawBurg>("burgs"), ref);
    if (!entry) return null;
    if (entry.i <= 0) return null;
    if (entry.removed) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousLink: readPreviousLink(entry.link),
    };
  },
  apply(i, link) {
    const burgs = getPackCollection<RawBurg>("burgs");
    const burg = burgs?.[i];
    if (!burg) throw new Error(`Burg ${i} not found.`);
    if (link === null) {
      delete burg.link;
    } else {
      burg.link = link;
    }
    // Best-effort cosmetic refresh of the editor's preview popup if it's
    // open. The fn is a closure inside burg-editor.js and is generally
    // not on globalThis; absent / throwing is non-fatal.
    const fn = getGlobal<(burg: unknown) => void>("updateBurgPreview");
    if (typeof fn === "function") {
      try {
        fn(burg);
      } catch {
        // swallow
      }
    }
  },
};

export function createSetBurgLinkTool(
  runtime: SetBurgLinkRuntime = defaultSetBurgLinkRuntime,
): Tool {
  return {
    name: "set_burg_link",
    description:
      "Set or clear a burg's custom preview-URL (`burg.link`) — same side-effect as the \"Set preview link\" button in the Burg Editor (`setCustomPreview` in `public/modules/ui/burg-editor.js`). When set, `Burgs.getPreview(burg)` returns this URL instead of the auto-generated MFCG / village-generator link, so the burg preview popup loads the user-supplied page or image. Pass `link` as a non-empty string to set the URL (trimmed); pass `null` to clear it (removes the field via `delete burg.link`, matching the editor's empty-input semantics — `'link' in burg` becomes `false`). Empty strings and whitespace-only strings are rejected; pass `null` explicitly to clear. No URL validation — any string is accepted, mirroring the legacy UI. Idempotent.",
    input_schema: {
      type: "object",
      properties: {
        burg: {
          type: ["integer", "string"],
          description: "Numeric burg id (> 0) or case-insensitive name.",
        },
        link: {
          type: ["string", "null"],
          description:
            "URL to set as burg.link (non-empty string, will be trimmed), or null to clear the field.",
        },
      },
      required: ["burg", "link"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        burg?: unknown;
        link?: unknown;
      };

      const refResult = parseEntityRef(input.burg, "burg");
      if (!refResult.ok) return errorResult(refResult.error);

      let linkValue: string | null;
      if (input.link === null) {
        linkValue = null;
      } else if (typeof input.link === "string" && input.link.trim() !== "") {
        linkValue = input.link.trim();
      } else {
        return errorResult("link must be a non-empty string or null.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No burg found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (current.previousLink === linkValue) {
        return okResult({
          i: current.i,
          name: current.name,
          previousLink: current.previousLink,
          link: linkValue,
          noop: true,
        });
      }

      try {
        runtime.apply(current.i, linkValue);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousLink: current.previousLink,
        link: linkValue,
        noop: false,
      });
    },
  };
}

export const setBurgLinkTool = createSetBurgLinkTool();
