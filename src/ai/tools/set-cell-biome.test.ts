import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  type CellBiomeRuntime,
  createSetCellBiomeTool,
  defaultCellBiomeRuntime,
  setCellBiomeTool,
} from "./set-cell-biome";

const DEFAULT_BIOME_NAMES = [
  "Marine",
  "Hot desert",
  "Cold desert",
  "Savanna",
  "Grassland",
  "Tropical seasonal forest",
  "Temperate deciduous forest",
  "Tropical rainforest",
  "Temperate rainforest",
  "Taiga",
  "Tundra",
  "Glacier",
  "Wetland",
];

interface MakeRuntimeOpts {
  cellBiomes?: ArrayLike<number> & { [i: number]: number; length: number };
  biomeNames?: string[] | null;
  drawBiomes?: () => void;
  setCellBiomeImpl?: (cell: number, biome: number) => void;
  getCellBiomesOverride?: () =>
    | (ArrayLike<number> & { [i: number]: number; length: number })
    | null;
  getBiomeNamesOverride?: () => string[] | null;
}

function makeRuntime(opts: MakeRuntimeOpts = {}) {
  const initialCells = opts.cellBiomes ?? new Uint8Array([0, 1, 2, 3, 4]);
  const cellBiomes = initialCells;
  const biomeNames =
    opts.biomeNames === undefined ? DEFAULT_BIOME_NAMES : opts.biomeNames;

  const setCellBiome = vi.fn<CellBiomeRuntime["setCellBiome"]>(
    opts.setCellBiomeImpl ??
      ((cell: number, biome: number) => {
        cellBiomes[cell] = biome;
      }),
  );
  const drawBiomes = vi.fn<CellBiomeRuntime["drawBiomes"]>(
    opts.drawBiomes ?? (() => undefined),
  );
  const getCellBiomes = vi.fn<CellBiomeRuntime["getCellBiomes"]>(
    opts.getCellBiomesOverride ?? (() => cellBiomes),
  );
  const getBiomeNames = vi.fn<CellBiomeRuntime["getBiomeNames"]>(
    opts.getBiomeNamesOverride ?? (() => biomeNames),
  );

  const runtime: CellBiomeRuntime = {
    getCellBiomes,
    setCellBiome,
    getBiomeNames,
    drawBiomes,
  };
  return {
    runtime,
    cellBiomes,
    biomeNames,
    setCellBiome,
    drawBiomes,
    getCellBiomes,
    getBiomeNames,
  };
}

describe("set_cell_biome tool (stub runtime)", () => {
  it("writes the biome on a happy path", async () => {
    const { runtime, setCellBiome } = makeRuntime({
      cellBiomes: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 2]),
    });
    const tool = createSetCellBiomeTool(runtime);
    const result = await tool.execute({ cell: 7, biome: 5 });
    expect(result.isError).toBeFalsy();
    expect(setCellBiome).toHaveBeenCalledWith(7, 5);
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      cell: 7,
      previous_biome: 2,
      previous_biome_name: "Cold desert",
      biome: 5,
      biome_name: "Tropical seasonal forest",
    });
  });

  it("supports same-biome no-op (sets cell to its current value)", async () => {
    const { runtime, setCellBiome } = makeRuntime({
      cellBiomes: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 2]),
    });
    const tool = createSetCellBiomeTool(runtime);
    const result = await tool.execute({ cell: 7, biome: 2 });
    expect(result.isError).toBeFalsy();
    expect(setCellBiome).toHaveBeenCalledWith(7, 2);
    const body = JSON.parse(result.content);
    expect(body.previous_biome).toBe(2);
    expect(body.biome).toBe(2);
    expect(body.previous_biome_name).toBe("Cold desert");
    expect(body.biome_name).toBe("Cold desert");
  });

  it("captures previous_biome BEFORE mutation", async () => {
    const cellBiomes = new Uint8Array([0, 1, 2, 3, 4]);
    let capturedAtCallTime: number | null = null;
    const setCellBiomeImpl = (cell: number, biome: number) => {
      // record what's in the array BEFORE we write
      capturedAtCallTime = cellBiomes[cell];
      cellBiomes[cell] = biome;
    };
    const { runtime } = makeRuntime({ cellBiomes, setCellBiomeImpl });
    const tool = createSetCellBiomeTool(runtime);
    const result = await tool.execute({ cell: 2, biome: 9 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_biome).toBe(2);
    expect(capturedAtCallTime).toBe(2);
    // Post-mutation: array shows the new value.
    expect(cellBiomes[2]).toBe(9);
  });

  it("looks up biome_name and previous_biome_name from biomesData.name", async () => {
    const { runtime } = makeRuntime({
      cellBiomes: new Uint8Array([0, 1, 2, 3, 4, 5]),
      biomeNames: ["A", "B", "C", "D", "E", "F"],
    });
    const tool = createSetCellBiomeTool(runtime);
    const result = await tool.execute({ cell: 1, biome: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_biome_name).toBe("B");
    expect(body.biome_name).toBe("E");
  });

  it("returns previous_biome_name='' when previous value is out of name-range (defensive)", async () => {
    // Stale value: cellBiomes[0] = 99 but biomeNames length is 2.
    const cellBiomes = new Uint8Array([99, 0]);
    const { runtime } = makeRuntime({
      cellBiomes,
      biomeNames: ["X", "Y"],
    });
    const tool = createSetCellBiomeTool(runtime);
    const result = await tool.execute({ cell: 0, biome: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_biome).toBe(99);
    expect(body.previous_biome_name).toBe("");
    expect(body.biome).toBe(1);
    expect(body.biome_name).toBe("Y");
  });

  it("calls drawBiomes after a successful write", async () => {
    const { runtime, drawBiomes } = makeRuntime();
    const tool = createSetCellBiomeTool(runtime);
    const result = await tool.execute({ cell: 0, biome: 1 });
    expect(result.isError).toBeFalsy();
    expect(drawBiomes).toHaveBeenCalledTimes(1);
  });

  it("survives drawBiomes being a no-op", async () => {
    const { runtime } = makeRuntime({
      drawBiomes: () => undefined,
    });
    const tool = createSetCellBiomeTool(runtime);
    const result = await tool.execute({ cell: 0, biome: 1 });
    expect(result.isError).toBeFalsy();
  });

  it("survives drawBiomes throwing (best-effort, write already done)", async () => {
    const cellBiomes = new Uint8Array([0, 1, 2, 3, 4]);
    const { runtime } = makeRuntime({
      cellBiomes,
      drawBiomes: () => {
        throw new Error("boom");
      },
    });
    const tool = createSetCellBiomeTool(runtime);
    const result = await tool.execute({ cell: 2, biome: 5 });
    expect(result.isError).toBeFalsy();
    expect(cellBiomes[2]).toBe(5);
  });

  it("rejects missing cell", async () => {
    const { runtime, setCellBiome } = makeRuntime();
    const tool = createSetCellBiomeTool(runtime);
    for (const missing of [undefined, null]) {
      const r = await tool.execute({ cell: missing, biome: 1 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /cell must be a non-negative integer/i,
      );
    }
    expect(setCellBiome).not.toHaveBeenCalled();
  });

  it("rejects missing biome", async () => {
    const { runtime, setCellBiome } = makeRuntime();
    const tool = createSetCellBiomeTool(runtime);
    for (const missing of [undefined, null]) {
      const r = await tool.execute({ cell: 1, biome: missing });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /biome must be a non-negative integer/i,
      );
    }
    expect(setCellBiome).not.toHaveBeenCalled();
  });

  it("rejects non-numeric cell", async () => {
    const { runtime, setCellBiome } = makeRuntime();
    const tool = createSetCellBiomeTool(runtime);
    for (const bad of [
      "1",
      true,
      {},
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      const r = await tool.execute({ cell: bad, biome: 0 });
      expect(r.isError).toBe(true);
    }
    expect(setCellBiome).not.toHaveBeenCalled();
  });

  it("rejects non-integer cell", async () => {
    const { runtime, setCellBiome } = makeRuntime();
    const tool = createSetCellBiomeTool(runtime);
    for (const bad of [1.5, 2.1, 3.9999]) {
      const r = await tool.execute({ cell: bad, biome: 0 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/non-negative integer/);
    }
    expect(setCellBiome).not.toHaveBeenCalled();
  });

  it("rejects negative cell", async () => {
    const { runtime, setCellBiome } = makeRuntime();
    const tool = createSetCellBiomeTool(runtime);
    for (const bad of [-1, -100]) {
      const r = await tool.execute({ cell: bad, biome: 0 });
      expect(r.isError).toBe(true);
    }
    expect(setCellBiome).not.toHaveBeenCalled();
  });

  it("rejects non-numeric biome", async () => {
    const { runtime, setCellBiome } = makeRuntime();
    const tool = createSetCellBiomeTool(runtime);
    for (const bad of ["1", true, {}, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await tool.execute({ cell: 0, biome: bad });
      expect(r.isError).toBe(true);
    }
    expect(setCellBiome).not.toHaveBeenCalled();
  });

  it("rejects non-integer biome", async () => {
    const { runtime, setCellBiome } = makeRuntime();
    const tool = createSetCellBiomeTool(runtime);
    const r = await tool.execute({ cell: 0, biome: 1.5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/non-negative integer/);
    expect(setCellBiome).not.toHaveBeenCalled();
  });

  it("rejects negative biome", async () => {
    const { runtime, setCellBiome } = makeRuntime();
    const tool = createSetCellBiomeTool(runtime);
    const r = await tool.execute({ cell: 0, biome: -1 });
    expect(r.isError).toBe(true);
    expect(setCellBiome).not.toHaveBeenCalled();
  });

  it("rejects cell out of range", async () => {
    const { runtime, setCellBiome } = makeRuntime({
      cellBiomes: new Uint8Array([0, 0, 0, 0, 0]),
    });
    const tool = createSetCellBiomeTool(runtime);
    const r1 = await tool.execute({ cell: 5, biome: 0 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toBe(
      "cell 5 is out of range (max 4).",
    );
    const r2 = await tool.execute({ cell: 10, biome: 0 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toBe(
      "cell 10 is out of range (max 4).",
    );
    expect(setCellBiome).not.toHaveBeenCalled();
  });

  it("rejects biome out of range", async () => {
    const { runtime, setCellBiome } = makeRuntime();
    const tool = createSetCellBiomeTool(runtime);
    const r1 = await tool.execute({ cell: 0, biome: 13 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toBe(
      "biome 13 is not a valid biome id (max 12).",
    );
    const r2 = await tool.execute({ cell: 0, biome: 99 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toBe(
      "biome 99 is not a valid biome id (max 12).",
    );
    expect(setCellBiome).not.toHaveBeenCalled();
  });

  it("errors when pack.cells.biome is missing", async () => {
    const { runtime, setCellBiome } = makeRuntime({
      getCellBiomesOverride: () => null,
    });
    const tool = createSetCellBiomeTool(runtime);
    const r = await tool.execute({ cell: 0, biome: 0 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "window.pack.cells.biome is not available; the map hasn't finished loading.",
    );
    expect(setCellBiome).not.toHaveBeenCalled();
  });

  it("errors when biomesData.name is missing", async () => {
    const { runtime, setCellBiome } = makeRuntime({
      getBiomeNamesOverride: () => null,
    });
    const tool = createSetCellBiomeTool(runtime);
    const r = await tool.execute({ cell: 0, biome: 0 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "window.biomesData.name is not available; the map hasn't finished loading.",
    );
    expect(setCellBiome).not.toHaveBeenCalled();
  });

  it("mutates the typed array in place (no reassignment)", async () => {
    const cellBiomes = new Uint8Array([0, 1, 2, 3, 4]);
    const { runtime, getCellBiomes } = makeRuntime({ cellBiomes });
    const tool = createSetCellBiomeTool(runtime);
    const result = await tool.execute({ cell: 3, biome: 7 });
    expect(result.isError).toBeFalsy();
    // Same reference returned by the runtime (no replacement).
    expect(getCellBiomes).toHaveBeenCalled();
    expect(getCellBiomes.mock.results[0]?.value).toBe(cellBiomes);
    // Underlying buffer mutated in place.
    expect(cellBiomes[3]).toBe(7);
    expect(Array.from(cellBiomes)).toEqual([0, 1, 2, 7, 4]);
  });

  it("propagates runtime errors as isError", async () => {
    const { runtime } = makeRuntime({
      setCellBiomeImpl: () => {
        throw new Error("custom write failure");
      },
    });
    const tool = createSetCellBiomeTool(runtime);
    const result = await tool.execute({ cell: 0, biome: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/custom write failure/);
  });

  it("works through a ToolRegistry round-trip", async () => {
    const { runtime, setCellBiome } = makeRuntime();
    const tool = createSetCellBiomeTool(runtime);
    const registry = new ToolRegistry();
    registry.register(tool);
    const result = await registry.run("set_cell_biome", {
      cell: 0,
      biome: 0,
    });
    expect(result.isError).toBeFalsy();
    expect(setCellBiome).toHaveBeenCalledWith(0, 0);
  });

  it("is exported as setCellBiomeTool with the expected shape", () => {
    expect(setCellBiomeTool.name).toBe("set_cell_biome");
    expect(setCellBiomeTool.input_schema.type).toBe("object");
    expect(setCellBiomeTool.input_schema.required).toEqual(["cell", "biome"]);
  });
});

describe("defaultCellBiomeRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    biomesData?: unknown;
    drawBiomes?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalBiomesData = globalsRef.biomesData;
  const originalDrawBiomes = globalsRef.drawBiomes;

  beforeEach(() => {
    globalsRef.pack = {
      cells: { biome: new Uint8Array([0, 1, 2, 3, 4]) },
    };
    globalsRef.biomesData = { name: [...DEFAULT_BIOME_NAMES] };
    delete globalsRef.drawBiomes;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.biomesData = originalBiomesData;
    globalsRef.drawBiomes = originalDrawBiomes;
  });

  it("mutates globalThis.pack.cells.biome in place via the default runtime", async () => {
    const pack = globalsRef.pack as {
      cells: { biome: Uint8Array };
    };
    const arrBefore = pack.cells.biome;
    const tool = createSetCellBiomeTool(defaultCellBiomeRuntime);
    const result = await tool.execute({ cell: 2, biome: 4 });
    expect(result.isError).toBeFalsy();
    // Identity preserved (no reassignment).
    expect(pack.cells.biome).toBe(arrBefore);
    expect(pack.cells.biome[2]).toBe(4);
    expect(Array.from(pack.cells.biome)).toEqual([0, 1, 4, 3, 4]);
  });

  it("captures previous_biome BEFORE mutation (default runtime)", async () => {
    const tool = createSetCellBiomeTool(defaultCellBiomeRuntime);
    const result = await tool.execute({ cell: 2, biome: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_biome).toBe(2);
    expect(body.previous_biome_name).toBe("Cold desert");
    expect(body.biome).toBe(4);
    expect(body.biome_name).toBe("Grassland");
  });

  it("supports same-biome no-op via the default runtime", async () => {
    const pack = globalsRef.pack as {
      cells: { biome: Uint8Array };
    };
    const tool = createSetCellBiomeTool(defaultCellBiomeRuntime);
    const result = await tool.execute({ cell: 2, biome: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_biome).toBe(2);
    expect(body.biome).toBe(2);
    expect(pack.cells.biome[2]).toBe(2);
  });

  it("errors when pack.cells.biome is missing (default runtime)", async () => {
    globalsRef.pack = {};
    const drawSpy = vi.fn();
    globalsRef.drawBiomes = drawSpy;
    const tool = createSetCellBiomeTool(defaultCellBiomeRuntime);
    const result = await tool.execute({ cell: 0, biome: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /pack\.cells\.biome is not available/,
    );
    expect(drawSpy).not.toHaveBeenCalled();
  });

  it("errors when biomesData.name is missing (default runtime)", async () => {
    globalsRef.biomesData = {};
    const tool = createSetCellBiomeTool(defaultCellBiomeRuntime);
    const result = await tool.execute({ cell: 0, biome: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /biomesData\.name is not available/,
    );
  });

  it("calls drawBiomes when present (default runtime)", async () => {
    const drawSpy = vi.fn();
    globalsRef.drawBiomes = drawSpy;
    const tool = createSetCellBiomeTool(defaultCellBiomeRuntime);
    const result = await tool.execute({ cell: 0, biome: 0 });
    expect(result.isError).toBeFalsy();
    expect(drawSpy).toHaveBeenCalledTimes(1);
  });

  it("succeeds when drawBiomes is missing (default runtime)", async () => {
    delete globalsRef.drawBiomes;
    const tool = createSetCellBiomeTool(defaultCellBiomeRuntime);
    const result = await tool.execute({ cell: 0, biome: 0 });
    expect(result.isError).toBeFalsy();
  });

  it("survives drawBiomes throwing (default runtime, best-effort)", async () => {
    globalsRef.drawBiomes = vi.fn(() => {
      throw new Error("render failure");
    });
    const pack = globalsRef.pack as {
      cells: { biome: Uint8Array };
    };
    const tool = createSetCellBiomeTool(defaultCellBiomeRuntime);
    const result = await tool.execute({ cell: 1, biome: 5 });
    expect(result.isError).toBeFalsy();
    // Data still mutated despite drawBiomes failure.
    expect(pack.cells.biome[1]).toBe(5);
  });
});
