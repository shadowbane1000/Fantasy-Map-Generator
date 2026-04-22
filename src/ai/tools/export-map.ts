import {
  createAliasResolver,
  errorResult,
  getGlobal,
  okResult,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export type ExportFormat =
  | "svg"
  | "png"
  | "jpeg"
  | "geojson-cells"
  | "geojson-routes"
  | "geojson-rivers"
  | "geojson-markers"
  | "geojson-zones";

export const EXPORT_FORMATS: ExportFormat[] = [
  "svg",
  "png",
  "jpeg",
  "geojson-cells",
  "geojson-routes",
  "geojson-rivers",
  "geojson-markers",
  "geojson-zones",
];

const resolveFormat = createAliasResolver<ExportFormat>(EXPORT_FORMATS, {
  "image/svg": "svg",
  "image/svg+xml": "svg",
  "svg+xml": "svg",
  "image/png": "png",
  jpg: "jpeg",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  cells: "geojson-cells",
  "cells-geojson": "geojson-cells",
  routes: "geojson-routes",
  "routes-geojson": "geojson-routes",
  rivers: "geojson-rivers",
  "rivers-geojson": "geojson-rivers",
  markers: "geojson-markers",
  "markers-geojson": "geojson-markers",
  zones: "geojson-zones",
  "zones-geojson": "geojson-zones",
});

export function resolveExportFormat(value: unknown): ExportFormat | null {
  return resolveFormat(value);
}

export interface MapExportRuntime {
  export(format: ExportFormat): Promise<void> | void;
}

const GLOBAL_FN_NAMES: Record<ExportFormat, string> = {
  svg: "exportToSvg",
  png: "exportToPng",
  jpeg: "exportToJpeg",
  "geojson-cells": "saveGeoJsonCells",
  "geojson-routes": "saveGeoJsonRoutes",
  "geojson-rivers": "saveGeoJsonRivers",
  "geojson-markers": "saveGeoJsonMarkers",
  "geojson-zones": "saveGeoJsonZones",
};

export const defaultMapExportRuntime: MapExportRuntime = {
  async export(format: ExportFormat): Promise<void> {
    const name = GLOBAL_FN_NAMES[format];
    const fn = getGlobal<() => Promise<void> | void>(name);
    if (typeof fn !== "function") {
      throw new Error(
        `${name} is not available yet; wait for the map to finish loading.`,
      );
    }
    await fn();
  },
};

export function createExportMapTool(
  runtime: MapExportRuntime = defaultMapExportRuntime,
): Tool {
  return {
    name: "export_map",
    description: `Export the current map to a downloadable file. Supported formats: ${EXPORT_FORMATS.join(", ")}. Aliases accepted (e.g. "jpg" → jpeg, "cells" → geojson-cells, "markers" → geojson-markers). Triggers a browser download via the same global helpers the File → Export menu uses.`,
    input_schema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          description: `Export format: ${EXPORT_FORMATS.join(", ")}. Common aliases accepted.`,
        },
      },
      required: ["format"],
    },
    async execute(rawInput: unknown): Promise<ToolResult> {
      const input = (rawInput ?? {}) as { format?: unknown };

      if (typeof input.format !== "string" || !input.format.trim()) {
        return errorResult("format must be a non-empty string.", {
          supported: [...EXPORT_FORMATS],
        });
      }

      const resolved = resolveExportFormat(input.format);
      if (!resolved) {
        return errorResult(
          `Unknown export format: ${JSON.stringify(input.format)}.`,
          { supported: [...EXPORT_FORMATS] },
        );
      }

      try {
        await runtime.export(resolved);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ format: resolved });
    },
  };
}

export const exportMapTool = createExportMapTool();
