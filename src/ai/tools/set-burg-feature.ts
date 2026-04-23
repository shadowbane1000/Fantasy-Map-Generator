import {
  createAliasResolver,
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawBurg,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const BURG_FEATURES = [
  "citadel",
  "walls",
  "plaza",
  "temple",
  "shanty",
] as const;

export type BurgFeature = (typeof BURG_FEATURES)[number];

const featureResolver = createAliasResolver<BurgFeature>(BURG_FEATURES, {
  citadels: "citadel",
  castle: "citadel",
  fortress: "citadel",
  wall: "walls",
  fortifications: "walls",
  plazas: "plaza",
  square: "plaza",
  marketplace: "plaza",
  temples: "temple",
  shrine: "temple",
  cathedral: "temple",
  church: "temple",
  shanties: "shanty",
  shantytown: "shanty",
  slums: "shanty",
});

export function resolveBurgFeature(value: unknown): BurgFeature | null {
  return featureResolver(value);
}

export interface BurgFeatureRef {
  i: number;
  name: string;
  feature: BurgFeature;
  previousEnabled: boolean;
}

export interface BurgFeatureRuntime {
  find(ref: number | string, feature: BurgFeature): BurgFeatureRef | null;
  apply(i: number, feature: BurgFeature, enabled: boolean): void;
}

export const defaultBurgFeatureRuntime: BurgFeatureRuntime = {
  find(ref, feature) {
    const entry = findEntityByRef(getPackCollection<RawBurg>("burgs"), ref);
    if (!entry) return null;
    if (entry.i <= 0) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      feature,
      previousEnabled: !!entry[feature],
    };
  },
  apply(i, feature, enabled) {
    const burgs = getPackCollection<RawBurg>("burgs");
    const b = burgs?.[i];
    if (!b) throw new Error(`Burg ${i} not found.`);
    if (b.removed) throw new Error(`Burg ${i} has been removed.`);
    b[feature] = enabled ? 1 : 0;
  },
};

export function createSetBurgFeatureTool(
  runtime: BurgFeatureRuntime = defaultBurgFeatureRuntime,
): Tool {
  return {
    name: "set_burg_feature",
    description: `Toggle one of a burg's structural features — same side-effect as the feature-row buttons in the Burg Editor. Writes \`burg.<feature> = enabled ? 1 : 0\`. Supported features: ${BURG_FEATURES.join(", ")}. Not supported here: \`port\` (requires haven + SVG anchor) and \`capital\` (requires state reassignment) — those need their own tools. Idempotent (noop when already at the requested state). No redraw call: matches the UI, which only refreshes the editor's own preview.`,
    input_schema: {
      type: "object",
      properties: {
        burg: {
          type: ["integer", "string"],
          description: "Numeric burg id (> 0) or current name.",
        },
        feature: {
          type: "string",
          enum: [...BURG_FEATURES],
          description: `One of: ${BURG_FEATURES.join(", ")} (case-insensitive; common synonyms accepted).`,
        },
        enabled: {
          type: "boolean",
          description: "true to enable the feature, false to disable it.",
        },
      },
      required: ["burg", "feature", "enabled"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        burg?: unknown;
        feature?: unknown;
        enabled?: unknown;
      };

      const refResult = parseEntityRef(input.burg, "burg");
      if (!refResult.ok) return errorResult(refResult.error);

      const feature = resolveBurgFeature(input.feature);
      if (!feature) {
        return errorResult(
          `Unknown burg feature: ${JSON.stringify(input.feature)}. Use set_burg_feature only for: ${BURG_FEATURES.join(", ")}. \`port\` and \`capital\` are not supported by this tool.`,
          { supported: [...BURG_FEATURES] },
        );
      }

      if (typeof input.enabled !== "boolean") {
        return errorResult("enabled must be a boolean.");
      }

      const current = runtime.find(refResult.ref, feature);
      if (!current) {
        return errorResult(
          `No burg found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (current.previousEnabled === input.enabled) {
        return okResult({
          i: current.i,
          name: current.name,
          feature,
          enabled: input.enabled,
          previousEnabled: current.previousEnabled,
          noop: true,
        });
      }

      try {
        runtime.apply(current.i, feature, input.enabled);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        feature,
        enabled: input.enabled,
        previousEnabled: current.previousEnabled,
        noop: false,
      });
    },
  };
}

export const setBurgFeatureTool = createSetBurgFeatureTool();
