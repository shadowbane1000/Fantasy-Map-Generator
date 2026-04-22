import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createExportMapTool,
  defaultMapExportRuntime,
  EXPORT_FORMATS,
  type ExportFormat,
  type MapExportRuntime,
  resolveExportFormat,
} from "./export-map";

function makeRuntime(behavior: "resolve" | "reject" | "throw" = "resolve") {
  const exportFn = vi.fn<(format: ExportFormat) => Promise<void>>(
    async (_format) => {
      void _format;
      if (behavior === "reject")
        throw new Error("saveGeoJsonRoutes is not available yet.");
    },
  );
  const runtime: MapExportRuntime = { export: exportFn };
  if (behavior === "throw") {
    runtime.export = vi.fn(() => {
      throw new Error("synchronous export failure");
    });
  }
  return { runtime, exportFn };
}

describe("export_map tool", () => {
  it("calls the runtime with each canonical format", async () => {
    const { runtime, exportFn } = makeRuntime();
    const tool = createExportMapTool(runtime);
    for (const format of EXPORT_FORMATS) {
      exportFn.mockClear();
      const result = await tool.execute({ format });
      expect(result.isError).toBeFalsy();
      expect(exportFn).toHaveBeenCalledWith(format);
      expect(JSON.parse(result.content)).toEqual({ ok: true, format });
    }
  });

  it("resolves friendly aliases", async () => {
    const { runtime, exportFn } = makeRuntime();
    const tool = createExportMapTool(runtime);
    const cases: Array<[string, ExportFormat]> = [
      ["jpg", "jpeg"],
      ["JPG", "jpeg"],
      ["image/svg", "svg"],
      ["svg+xml", "svg"],
      ["cells", "geojson-cells"],
      ["  routes  ", "geojson-routes"],
      ["markers", "geojson-markers"],
      ["zones", "geojson-zones"],
    ];
    for (const [input, expected] of cases) {
      exportFn.mockClear();
      await tool.execute({ format: input });
      expect(exportFn).toHaveBeenCalledWith(expected);
    }
  });

  it("rejects unknown formats with a supported list", async () => {
    const { runtime, exportFn } = makeRuntime();
    const tool = createExportMapTool(runtime);
    const result = await tool.execute({ format: "gif" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.supported).toEqual([...EXPORT_FORMATS]);
    expect(exportFn).not.toHaveBeenCalled();
  });

  it("rejects missing / empty / non-string formats", async () => {
    const { runtime, exportFn } = makeRuntime();
    const tool = createExportMapTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      const r = await tool.execute({ format: bad });
      expect(r.isError).toBe(true);
    }
    expect(exportFn).not.toHaveBeenCalled();
  });

  it("surfaces async rejections", async () => {
    const { runtime } = makeRuntime("reject");
    const tool = createExportMapTool(runtime);
    const result = await tool.execute({ format: "geojson-routes" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
  });

  it("surfaces synchronous throws", async () => {
    const { runtime } = makeRuntime("throw");
    const tool = createExportMapTool(runtime);
    const result = await tool.execute({ format: "svg" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/synchronous/);
  });
});

describe("resolveExportFormat", () => {
  it("handles every canonical format + common aliases", () => {
    for (const fmt of EXPORT_FORMATS) {
      expect(resolveExportFormat(fmt)).toBe(fmt);
    }
    expect(resolveExportFormat("jpg")).toBe("jpeg");
    expect(resolveExportFormat("JPEG")).toBe("jpeg");
    expect(resolveExportFormat("image/png")).toBe("png");
    expect(resolveExportFormat("  cells  ")).toBe("geojson-cells");
  });
  it("returns null for unknown or invalid inputs", () => {
    expect(resolveExportFormat("gif")).toBeNull();
    expect(resolveExportFormat("")).toBeNull();
    expect(resolveExportFormat(null)).toBeNull();
    expect(resolveExportFormat(42)).toBeNull();
  });
});

describe("defaultMapExportRuntime dispatch", () => {
  const globalNames = [
    "exportToSvg",
    "exportToPng",
    "exportToJpeg",
    "saveGeoJsonCells",
    "saveGeoJsonRoutes",
    "saveGeoJsonRivers",
    "saveGeoJsonMarkers",
    "saveGeoJsonZones",
  ] as const;

  let previous: Record<string, unknown>;

  beforeEach(() => {
    previous = {};
    for (const name of globalNames) {
      previous[name] = (globalThis as Record<string, unknown>)[name];
    }
  });
  afterEach(() => {
    for (const name of globalNames) {
      if (previous[name] === undefined) {
        delete (globalThis as Record<string, unknown>)[name];
      } else {
        (globalThis as Record<string, unknown>)[name] = previous[name];
      }
    }
  });

  it("dispatches svg / png / geojson-cells to the right globals", async () => {
    const exportToSvg = vi.fn();
    const exportToPng = vi.fn();
    const saveGeoJsonCells = vi.fn();
    Object.assign(globalThis, { exportToSvg, exportToPng, saveGeoJsonCells });

    await defaultMapExportRuntime.export("svg");
    await defaultMapExportRuntime.export("png");
    await defaultMapExportRuntime.export("geojson-cells");

    expect(exportToSvg).toHaveBeenCalledOnce();
    expect(exportToPng).toHaveBeenCalledOnce();
    expect(saveGeoJsonCells).toHaveBeenCalledOnce();
  });

  it("throws when the matching global is missing", async () => {
    await expect(defaultMapExportRuntime.export("svg")).rejects.toThrow(
      /exportToSvg/,
    );
  });
});
