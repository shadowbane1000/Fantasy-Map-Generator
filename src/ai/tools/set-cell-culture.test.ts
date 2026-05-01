import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  type CellCultureRuntime,
  createSetCellCultureTool,
  defaultCellCultureRuntime,
  setCellCultureTool,
} from "./set-cell-culture";

interface CultureEntry {
  i?: number;
  name?: string;
  removed?: boolean;
}

const DEFAULT_CULTURES: CultureEntry[] = [
  { i: 0, name: "Wildlands" },
  { i: 1, name: "Common" },
  { i: 2, name: "Elvish" },
  { i: 3, name: "Orcish" },
  { i: 4, name: "Halfling" },
  { i: 5, name: "Dwarvish" },
];

interface MakeRuntimeOpts {
  cellCultures?: ArrayLike<number> & { [i: number]: number; length: number };
  cultures?: (CultureEntry | null | undefined)[] | null;
  drawCultures?: () => void;
  setCellCultureImpl?: (cell: number, culture: number) => void;
  getCellCulturesOverride?: () =>
    | (ArrayLike<number> & { [i: number]: number; length: number })
    | null;
  getCulturesOverride?: () => (CultureEntry | null | undefined)[] | null;
}

function makeRuntime(opts: MakeRuntimeOpts = {}) {
  const cellCultures = opts.cellCultures ?? new Uint8Array([0, 1, 2, 3, 4]);
  const cultures =
    opts.cultures === undefined ? DEFAULT_CULTURES : opts.cultures;

  const setCellCulture = vi.fn<CellCultureRuntime["setCellCulture"]>(
    opts.setCellCultureImpl ??
      ((cell: number, culture: number) => {
        cellCultures[cell] = culture;
      }),
  );
  const drawCultures = vi.fn<CellCultureRuntime["drawCultures"]>(
    opts.drawCultures ?? (() => undefined),
  );
  const getCellCultures = vi.fn<CellCultureRuntime["getCellCultures"]>(
    opts.getCellCulturesOverride ?? (() => cellCultures),
  );
  const getCultures = vi.fn<CellCultureRuntime["getCultures"]>(
    opts.getCulturesOverride ?? (() => cultures),
  );

  const runtime: CellCultureRuntime = {
    getCellCultures,
    setCellCulture,
    getCultures,
    drawCultures,
  };
  return {
    runtime,
    cellCultures,
    cultures,
    setCellCulture,
    drawCultures,
    getCellCultures,
    getCultures,
  };
}

describe("set_cell_culture tool (stub runtime)", () => {
  it("writes the culture on a happy path", async () => {
    const { runtime, setCellCulture } = makeRuntime({
      cellCultures: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 2]),
    });
    const tool = createSetCellCultureTool(runtime);
    const result = await tool.execute({ cell: 7, culture: 5 });
    expect(result.isError).toBeFalsy();
    expect(setCellCulture).toHaveBeenCalledWith(7, 5);
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      cell: 7,
      previous_culture: 2,
      previous_culture_name: "Elvish",
      culture: 5,
      culture_name: "Dwarvish",
    });
  });

  it("accepts culture=0 (Wildlands)", async () => {
    const { runtime, setCellCulture } = makeRuntime({
      cellCultures: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 2]),
    });
    const tool = createSetCellCultureTool(runtime);
    const result = await tool.execute({ cell: 7, culture: 0 });
    expect(result.isError).toBeFalsy();
    expect(setCellCulture).toHaveBeenCalledWith(7, 0);
    const body = JSON.parse(result.content);
    expect(body.culture).toBe(0);
    expect(body.culture_name).toBe("Wildlands");
  });

  it("supports same-culture no-op (sets cell to its current value)", async () => {
    const { runtime, setCellCulture } = makeRuntime({
      cellCultures: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 2]),
    });
    const tool = createSetCellCultureTool(runtime);
    const result = await tool.execute({ cell: 7, culture: 2 });
    expect(result.isError).toBeFalsy();
    expect(setCellCulture).toHaveBeenCalledWith(7, 2);
    const body = JSON.parse(result.content);
    expect(body.previous_culture).toBe(2);
    expect(body.culture).toBe(2);
    expect(body.previous_culture_name).toBe("Elvish");
    expect(body.culture_name).toBe("Elvish");
  });

  it("captures previous_culture BEFORE mutation", async () => {
    const cellCultures = new Uint8Array([0, 1, 2, 3, 4]);
    let capturedAtCallTime: number | null = null;
    const setCellCultureImpl = (cell: number, culture: number) => {
      // record what's in the array BEFORE we write
      capturedAtCallTime = cellCultures[cell];
      cellCultures[cell] = culture;
    };
    const { runtime } = makeRuntime({ cellCultures, setCellCultureImpl });
    const tool = createSetCellCultureTool(runtime);
    const result = await tool.execute({ cell: 2, culture: 5 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_culture).toBe(2);
    expect(capturedAtCallTime).toBe(2);
    // Post-mutation: array shows the new value.
    expect(cellCultures[2]).toBe(5);
  });

  it("looks up culture_name and previous_culture_name from pack.cultures", async () => {
    const { runtime } = makeRuntime({
      cellCultures: new Uint8Array([0, 1, 2, 3, 4, 5]),
      cultures: [
        { i: 0, name: "A" },
        { i: 1, name: "B" },
        { i: 2, name: "C" },
        { i: 3, name: "D" },
        { i: 4, name: "E" },
        { i: 5, name: "F" },
      ],
    });
    const tool = createSetCellCultureTool(runtime);
    const result = await tool.execute({ cell: 1, culture: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_culture_name).toBe("B");
    expect(body.culture_name).toBe("E");
  });

  it("returns previous_culture_name='' when previous value is out of range (defensive)", async () => {
    // Stale value: cellCultures[0] = 99 but cultures length is 2.
    const cellCultures = new Uint8Array([99, 0]);
    const { runtime } = makeRuntime({
      cellCultures,
      cultures: [
        { i: 0, name: "X" },
        { i: 1, name: "Y" },
      ],
    });
    const tool = createSetCellCultureTool(runtime);
    const result = await tool.execute({ cell: 0, culture: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_culture).toBe(99);
    expect(body.previous_culture_name).toBe("");
    expect(body.culture).toBe(1);
    expect(body.culture_name).toBe("Y");
  });

  it("returns previous_culture_name='' when previous slot is null (defensive)", async () => {
    const cellCultures = new Uint8Array([0, 1, 2]);
    const { runtime } = makeRuntime({
      cellCultures,
      cultures: [{ i: 0, name: "Wildlands" }, null, { i: 2, name: "OK" }],
    });
    const tool = createSetCellCultureTool(runtime);
    const result = await tool.execute({ cell: 1, culture: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_culture).toBe(1);
    expect(body.previous_culture_name).toBe("");
    expect(body.culture).toBe(2);
    expect(body.culture_name).toBe("OK");
  });

  it("calls drawCultures after a successful write", async () => {
    const { runtime, drawCultures } = makeRuntime();
    const tool = createSetCellCultureTool(runtime);
    const result = await tool.execute({ cell: 0, culture: 1 });
    expect(result.isError).toBeFalsy();
    expect(drawCultures).toHaveBeenCalledTimes(1);
  });

  it("survives drawCultures being a no-op", async () => {
    const { runtime } = makeRuntime({
      drawCultures: () => undefined,
    });
    const tool = createSetCellCultureTool(runtime);
    const result = await tool.execute({ cell: 0, culture: 1 });
    expect(result.isError).toBeFalsy();
  });

  it("survives drawCultures throwing (best-effort, write already done)", async () => {
    const cellCultures = new Uint8Array([0, 1, 2, 3, 4]);
    const { runtime } = makeRuntime({
      cellCultures,
      drawCultures: () => {
        throw new Error("boom");
      },
    });
    const tool = createSetCellCultureTool(runtime);
    const result = await tool.execute({ cell: 2, culture: 5 });
    expect(result.isError).toBeFalsy();
    expect(cellCultures[2]).toBe(5);
  });

  it("rejects missing cell", async () => {
    const { runtime, setCellCulture } = makeRuntime();
    const tool = createSetCellCultureTool(runtime);
    for (const missing of [undefined, null]) {
      const r = await tool.execute({ cell: missing, culture: 1 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /cell must be a non-negative integer/i,
      );
    }
    expect(setCellCulture).not.toHaveBeenCalled();
  });

  it("rejects missing culture", async () => {
    const { runtime, setCellCulture } = makeRuntime();
    const tool = createSetCellCultureTool(runtime);
    for (const missing of [undefined, null]) {
      const r = await tool.execute({ cell: 1, culture: missing });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /culture must be a non-negative integer/i,
      );
    }
    expect(setCellCulture).not.toHaveBeenCalled();
  });

  it("rejects non-numeric cell", async () => {
    const { runtime, setCellCulture } = makeRuntime();
    const tool = createSetCellCultureTool(runtime);
    for (const bad of [
      "1",
      true,
      {},
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      const r = await tool.execute({ cell: bad, culture: 0 });
      expect(r.isError).toBe(true);
    }
    expect(setCellCulture).not.toHaveBeenCalled();
  });

  it("rejects non-integer cell", async () => {
    const { runtime, setCellCulture } = makeRuntime();
    const tool = createSetCellCultureTool(runtime);
    for (const bad of [1.5, 2.1, 3.9999]) {
      const r = await tool.execute({ cell: bad, culture: 0 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/non-negative integer/);
    }
    expect(setCellCulture).not.toHaveBeenCalled();
  });

  it("rejects negative cell", async () => {
    const { runtime, setCellCulture } = makeRuntime();
    const tool = createSetCellCultureTool(runtime);
    for (const bad of [-1, -100]) {
      const r = await tool.execute({ cell: bad, culture: 0 });
      expect(r.isError).toBe(true);
    }
    expect(setCellCulture).not.toHaveBeenCalled();
  });

  it("rejects non-numeric culture", async () => {
    const { runtime, setCellCulture } = makeRuntime();
    const tool = createSetCellCultureTool(runtime);
    for (const bad of ["1", true, {}, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await tool.execute({ cell: 0, culture: bad });
      expect(r.isError).toBe(true);
    }
    expect(setCellCulture).not.toHaveBeenCalled();
  });

  it("rejects non-integer culture", async () => {
    const { runtime, setCellCulture } = makeRuntime();
    const tool = createSetCellCultureTool(runtime);
    const r = await tool.execute({ cell: 0, culture: 1.5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/non-negative integer/);
    expect(setCellCulture).not.toHaveBeenCalled();
  });

  it("rejects negative culture", async () => {
    const { runtime, setCellCulture } = makeRuntime();
    const tool = createSetCellCultureTool(runtime);
    const r = await tool.execute({ cell: 0, culture: -1 });
    expect(r.isError).toBe(true);
    expect(setCellCulture).not.toHaveBeenCalled();
  });

  it("rejects cell out of range", async () => {
    const { runtime, setCellCulture } = makeRuntime({
      cellCultures: new Uint8Array([0, 0, 0, 0, 0]),
    });
    const tool = createSetCellCultureTool(runtime);
    const r1 = await tool.execute({ cell: 5, culture: 0 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toBe(
      "cell 5 is out of range (max 4).",
    );
    const r2 = await tool.execute({ cell: 10, culture: 0 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toBe(
      "cell 10 is out of range (max 4).",
    );
    expect(setCellCulture).not.toHaveBeenCalled();
  });

  it("rejects culture out of range", async () => {
    const { runtime, setCellCulture } = makeRuntime();
    const tool = createSetCellCultureTool(runtime);
    const r1 = await tool.execute({ cell: 0, culture: 6 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toBe(
      "culture 6 is not a valid culture id (max 5).",
    );
    const r2 = await tool.execute({ cell: 0, culture: 99 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toBe(
      "culture 99 is not a valid culture id (max 5).",
    );
    expect(setCellCulture).not.toHaveBeenCalled();
  });

  it("rejects removed culture", async () => {
    const cellCultures = new Uint8Array([0, 1, 2, 3, 4]);
    const cultures: CultureEntry[] = [
      { i: 0, name: "Wildlands" },
      { i: 1, name: "Common" },
      { i: 2, name: "Elvish" },
      { i: 3, name: "Orcish", removed: true },
      { i: 4, name: "Halfling" },
      { i: 5, name: "Dwarvish" },
    ];
    const { runtime, setCellCulture } = makeRuntime({
      cellCultures,
      cultures,
    });
    const tool = createSetCellCultureTool(runtime);
    const r = await tool.execute({ cell: 0, culture: 3 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe("Culture 3 has been removed.");
    expect(setCellCulture).not.toHaveBeenCalled();
    // Cells array untouched.
    expect(Array.from(cellCultures)).toEqual([0, 1, 2, 3, 4]);
  });

  it("errors when pack.cells.culture is missing", async () => {
    const { runtime, setCellCulture } = makeRuntime({
      getCellCulturesOverride: () => null,
    });
    const tool = createSetCellCultureTool(runtime);
    const r = await tool.execute({ cell: 0, culture: 0 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "window.pack.cells.culture is not available; the map hasn't finished loading.",
    );
    expect(setCellCulture).not.toHaveBeenCalled();
  });

  it("errors when pack.cultures is missing", async () => {
    const { runtime, setCellCulture } = makeRuntime({
      getCulturesOverride: () => null,
    });
    const tool = createSetCellCultureTool(runtime);
    const r = await tool.execute({ cell: 0, culture: 0 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "window.pack.cultures is not available; the map hasn't finished loading.",
    );
    expect(setCellCulture).not.toHaveBeenCalled();
  });

  it("mutates the typed array in place (no reassignment)", async () => {
    const cellCultures = new Uint8Array([0, 1, 2, 3, 4]);
    const { runtime, getCellCultures } = makeRuntime({ cellCultures });
    const tool = createSetCellCultureTool(runtime);
    const result = await tool.execute({ cell: 3, culture: 5 });
    expect(result.isError).toBeFalsy();
    // Same reference returned by the runtime (no replacement).
    expect(getCellCultures).toHaveBeenCalled();
    expect(getCellCultures.mock.results[0]?.value).toBe(cellCultures);
    // Underlying buffer mutated in place.
    expect(cellCultures[3]).toBe(5);
    expect(Array.from(cellCultures)).toEqual([0, 1, 2, 5, 4]);
  });

  it("propagates runtime errors as isError", async () => {
    const { runtime } = makeRuntime({
      setCellCultureImpl: () => {
        throw new Error("custom write failure");
      },
    });
    const tool = createSetCellCultureTool(runtime);
    const result = await tool.execute({ cell: 0, culture: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/custom write failure/);
  });

  it("works through a ToolRegistry round-trip", async () => {
    const { runtime, setCellCulture } = makeRuntime();
    const tool = createSetCellCultureTool(runtime);
    const registry = new ToolRegistry();
    registry.register(tool);
    const result = await registry.run("set_cell_culture", {
      cell: 0,
      culture: 0,
    });
    expect(result.isError).toBeFalsy();
    expect(setCellCulture).toHaveBeenCalledWith(0, 0);
  });

  it("is exported as setCellCultureTool with the expected shape", () => {
    expect(setCellCultureTool.name).toBe("set_cell_culture");
    expect(setCellCultureTool.input_schema.type).toBe("object");
    expect(setCellCultureTool.input_schema.required).toEqual([
      "cell",
      "culture",
    ]);
  });
});

describe("defaultCellCultureRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    drawCultures?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalDrawCultures = globalsRef.drawCultures;

  beforeEach(() => {
    // Deep-clone the cultures list so per-test mutations don't bleed.
    globalsRef.pack = {
      cells: { culture: new Uint8Array([0, 1, 2, 3, 4]) },
      cultures: DEFAULT_CULTURES.map((c) => ({ ...c })),
    };
    delete globalsRef.drawCultures;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.drawCultures = originalDrawCultures;
  });

  it("mutates globalThis.pack.cells.culture in place via the default runtime", async () => {
    const pack = globalsRef.pack as {
      cells: { culture: Uint8Array };
    };
    const arrBefore = pack.cells.culture;
    const tool = createSetCellCultureTool(defaultCellCultureRuntime);
    const result = await tool.execute({ cell: 2, culture: 4 });
    expect(result.isError).toBeFalsy();
    // Identity preserved (no reassignment).
    expect(pack.cells.culture).toBe(arrBefore);
    expect(pack.cells.culture[2]).toBe(4);
    expect(Array.from(pack.cells.culture)).toEqual([0, 1, 4, 3, 4]);
  });

  it("captures previous_culture BEFORE mutation (default runtime)", async () => {
    const tool = createSetCellCultureTool(defaultCellCultureRuntime);
    const result = await tool.execute({ cell: 2, culture: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_culture).toBe(2);
    expect(body.previous_culture_name).toBe("Elvish");
    expect(body.culture).toBe(4);
    expect(body.culture_name).toBe("Halfling");
  });

  it("supports same-culture no-op via the default runtime", async () => {
    const pack = globalsRef.pack as {
      cells: { culture: Uint8Array };
    };
    const tool = createSetCellCultureTool(defaultCellCultureRuntime);
    const result = await tool.execute({ cell: 2, culture: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_culture).toBe(2);
    expect(body.culture).toBe(2);
    expect(pack.cells.culture[2]).toBe(2);
  });

  it("accepts culture=0 (Wildlands) via the default runtime", async () => {
    const pack = globalsRef.pack as {
      cells: { culture: Uint8Array };
    };
    const tool = createSetCellCultureTool(defaultCellCultureRuntime);
    const result = await tool.execute({ cell: 2, culture: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.culture).toBe(0);
    expect(body.culture_name).toBe("Wildlands");
    expect(pack.cells.culture[2]).toBe(0);
  });

  it("errors when pack.cells.culture is missing (default runtime)", async () => {
    globalsRef.pack = { cultures: DEFAULT_CULTURES.map((c) => ({ ...c })) };
    const tool = createSetCellCultureTool(defaultCellCultureRuntime);
    const result = await tool.execute({ cell: 0, culture: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /pack\.cells\.culture is not available/,
    );
  });

  it("errors when pack.cultures is missing (default runtime)", async () => {
    globalsRef.pack = { cells: { culture: new Uint8Array([0, 1, 2, 3, 4]) } };
    const tool = createSetCellCultureTool(defaultCellCultureRuntime);
    const result = await tool.execute({ cell: 0, culture: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /pack\.cultures is not available/,
    );
  });

  it("rejects removed culture (default runtime) and leaves cells untouched", async () => {
    const pack = globalsRef.pack as {
      cells: { culture: Uint8Array };
      cultures: CultureEntry[];
    };
    pack.cultures[3]!.removed = true;
    const cellsBefore = Array.from(pack.cells.culture);
    const tool = createSetCellCultureTool(defaultCellCultureRuntime);
    const result = await tool.execute({ cell: 0, culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Culture 3 has been removed.",
    );
    expect(Array.from(pack.cells.culture)).toEqual(cellsBefore);
  });

  it("calls drawCultures when present (default runtime)", async () => {
    const drawSpy = vi.fn();
    globalsRef.drawCultures = drawSpy;
    const tool = createSetCellCultureTool(defaultCellCultureRuntime);
    const result = await tool.execute({ cell: 0, culture: 0 });
    expect(result.isError).toBeFalsy();
    expect(drawSpy).toHaveBeenCalledTimes(1);
  });

  it("succeeds when drawCultures is missing (default runtime)", async () => {
    delete globalsRef.drawCultures;
    const tool = createSetCellCultureTool(defaultCellCultureRuntime);
    const result = await tool.execute({ cell: 0, culture: 0 });
    expect(result.isError).toBeFalsy();
  });

  it("survives drawCultures throwing (default runtime, best-effort)", async () => {
    globalsRef.drawCultures = vi.fn(() => {
      throw new Error("render failure");
    });
    const pack = globalsRef.pack as {
      cells: { culture: Uint8Array };
    };
    const tool = createSetCellCultureTool(defaultCellCultureRuntime);
    const result = await tool.execute({ cell: 1, culture: 5 });
    expect(result.isError).toBeFalsy();
    // Data still mutated despite drawCultures failure.
    expect(pack.cells.culture[1]).toBe(5);
  });
});
