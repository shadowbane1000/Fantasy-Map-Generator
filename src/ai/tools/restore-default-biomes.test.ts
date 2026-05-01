import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createRestoreDefaultBiomesTool,
  type RestoreDefaultBiomesRuntime,
  restoreDefaultBiomesTool,
} from "./restore-default-biomes";

interface MakeRuntimeOptions {
  getDefault?: () => unknown;
  setBiomesData?: (data: unknown) => void;
  define?: () => void;
  cellBiomesSequence?: ArrayLike<number>[];
  getCellBiomes?: () => ArrayLike<number>;
  drawBiomes?: () => boolean;
  recalculatePopulation?: () => boolean;
}

function makeRuntime(opts: MakeRuntimeOptions = {}): {
  runtime: RestoreDefaultBiomesRuntime;
  getDefault: ReturnType<typeof vi.fn<() => unknown>>;
  setBiomesData: ReturnType<typeof vi.fn<(data: unknown) => void>>;
  define: ReturnType<typeof vi.fn<() => void>>;
  getCellBiomes: ReturnType<typeof vi.fn<() => ArrayLike<number>>>;
  drawBiomes: ReturnType<typeof vi.fn<() => boolean>>;
  recalculatePopulation: ReturnType<typeof vi.fn<() => boolean>>;
} {
  const sequence = opts.cellBiomesSequence ?? [[]];
  let callIndex = 0;
  const sequencedGetCellBiomes = (): ArrayLike<number> => {
    const idx = Math.min(callIndex, sequence.length - 1);
    callIndex++;
    return sequence[idx]!;
  };
  const getCellBiomesImpl = opts.getCellBiomes ?? sequencedGetCellBiomes;

  const getDefault = vi.fn<() => unknown>(opts.getDefault ?? (() => ({})));
  const setBiomesData = vi.fn<(data: unknown) => void>(
    opts.setBiomesData ?? (() => {}),
  );
  const define = vi.fn<() => void>(opts.define ?? (() => {}));
  const getCellBiomes = vi.fn<() => ArrayLike<number>>(getCellBiomesImpl);
  const drawBiomes = vi.fn<() => boolean>(opts.drawBiomes ?? (() => true));
  const recalculatePopulation = vi.fn<() => boolean>(
    opts.recalculatePopulation ?? (() => true),
  );

  return {
    runtime: {
      getDefault,
      setBiomesData,
      define,
      getCellBiomes,
      drawBiomes,
      recalculatePopulation,
    },
    getDefault,
    setBiomesData,
    define,
    getCellBiomes,
    drawBiomes,
    recalculatePopulation,
  };
}

describe("restore_default_biomes tool", () => {
  it("happy path: replaces biomesData and reports cells_changed + draw / recalc success", async () => {
    const defaultData = {
      name: Array.from({ length: 13 }, (_, i) => `B${i}`),
    };
    const before = Uint8Array.of(0, 1, 2, 3, 4);
    const after = Uint8Array.of(0, 1, 9, 9, 4);
    const {
      runtime,
      getDefault,
      setBiomesData,
      define,
      getCellBiomes,
      drawBiomes,
      recalculatePopulation,
    } = makeRuntime({
      getDefault: () => defaultData,
      cellBiomesSequence: [before, after],
    });
    const tool = createRestoreDefaultBiomesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      biomes_count: 13,
      cells_changed: 2,
      drew: true,
      recalculated_population: true,
    });
    expect(getDefault).toHaveBeenCalledTimes(1);
    expect(setBiomesData).toHaveBeenCalledTimes(1);
    expect(setBiomesData).toHaveBeenCalledWith(defaultData);
    expect(define).toHaveBeenCalledTimes(1);
    expect(getCellBiomes).toHaveBeenCalledTimes(2);
    expect(drawBiomes).toHaveBeenCalledTimes(1);
    expect(recalculatePopulation).toHaveBeenCalledTimes(1);
  });

  it("invokes runtime steps in order: snapshot → getDefault → setBiomesData → define → post-define snapshot → drawBiomes → recalculatePopulation", async () => {
    const {
      runtime,
      getDefault,
      setBiomesData,
      define,
      getCellBiomes,
      drawBiomes,
      recalculatePopulation,
    } = makeRuntime({
      getDefault: () => ({ name: ["X"] }),
      cellBiomesSequence: [
        [0, 1],
        [0, 1],
      ],
    });
    const tool = createRestoreDefaultBiomesTool(runtime);
    await tool.execute({});
    const orders = [
      getCellBiomes.mock.invocationCallOrder[0],
      getDefault.mock.invocationCallOrder[0],
      setBiomesData.mock.invocationCallOrder[0],
      define.mock.invocationCallOrder[0],
      getCellBiomes.mock.invocationCallOrder[1],
      drawBiomes.mock.invocationCallOrder[0],
      recalculatePopulation.mock.invocationCallOrder[0],
    ];
    for (const o of orders) {
      expect(o).toBeDefined();
    }
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i - 1] as number).toBeLessThan(orders[i] as number);
    }
  });

  it("cells_changed reflects the snapshot taken BEFORE define (load-bearing)", async () => {
    const { runtime } = makeRuntime({
      getDefault: () => ({ name: ["X"] }),
      // First call (pre-define) returns one array, second (post-define)
      // returns a different one. If the tool snapshotted post-define,
      // cells_changed would be 0.
      cellBiomesSequence: [
        [0, 1, 2, 3],
        [0, 5, 6, 3],
      ],
    });
    const tool = createRestoreDefaultBiomesTool(runtime);
    const result = await tool.execute({});
    expect(JSON.parse(result.content).cells_changed).toBe(2);
  });

  it("passes the SAME data reference from getDefault through to setBiomesData (no clone / wrap)", async () => {
    const defaultData = { name: ["X", "Y"] };
    const { runtime, setBiomesData } = makeRuntime({
      getDefault: () => defaultData,
    });
    const tool = createRestoreDefaultBiomesTool(runtime);
    await tool.execute({});
    expect(setBiomesData.mock.calls[0]?.[0]).toBe(defaultData);
  });

  it("surfaces getDefault errors and skips setBiomesData / define / draw / recalc", async () => {
    const {
      runtime,
      setBiomesData,
      define,
      drawBiomes,
      recalculatePopulation,
    } = makeRuntime({
      getDefault: () => {
        throw new Error(
          "Biomes.getDefault is not available; the map hasn't finished loading.",
        );
      },
    });
    const tool = createRestoreDefaultBiomesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Biomes\.getDefault/);
    expect(setBiomesData).not.toHaveBeenCalled();
    expect(define).not.toHaveBeenCalled();
    expect(drawBiomes).not.toHaveBeenCalled();
    expect(recalculatePopulation).not.toHaveBeenCalled();
  });

  it("surfaces define errors AFTER biomesData was reassigned (legacy ordering)", async () => {
    const defaultData = { name: ["X"] };
    const { runtime, setBiomesData, drawBiomes, recalculatePopulation } =
      makeRuntime({
        getDefault: () => defaultData,
        define: () => {
          throw new Error(
            "Biomes.define is not available; the map hasn't finished loading.",
          );
        },
      });
    const tool = createRestoreDefaultBiomesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Biomes\.define/);
    // Legacy ordering: biomesData IS swapped before define runs.
    expect(setBiomesData).toHaveBeenCalledTimes(1);
    expect(setBiomesData).toHaveBeenCalledWith(defaultData);
    expect(drawBiomes).not.toHaveBeenCalled();
    expect(recalculatePopulation).not.toHaveBeenCalled();
  });

  it("surfaces snapshot getCellBiomes error and skips everything else", async () => {
    const {
      runtime,
      getDefault,
      setBiomesData,
      define,
      drawBiomes,
      recalculatePopulation,
    } = makeRuntime({
      getCellBiomes: () => {
        throw new Error(
          "window.pack.cells.biome is not available; the map hasn't finished loading.",
        );
      },
    });
    const tool = createRestoreDefaultBiomesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.cells\.biome/);
    expect(getDefault).not.toHaveBeenCalled();
    expect(setBiomesData).not.toHaveBeenCalled();
    expect(define).not.toHaveBeenCalled();
    expect(drawBiomes).not.toHaveBeenCalled();
    expect(recalculatePopulation).not.toHaveBeenCalled();
  });

  it("drawBiomes returns false → result.drew = false; recalc still runs", async () => {
    const { runtime, recalculatePopulation } = makeRuntime({
      getDefault: () => ({ name: ["X"] }),
      drawBiomes: () => false,
    });
    const tool = createRestoreDefaultBiomesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.drew).toBe(false);
    expect(parsed.recalculated_population).toBe(true);
    expect(recalculatePopulation).toHaveBeenCalledTimes(1);
  });

  it("recalculatePopulation returns false → result.recalculated_population = false; draw still runs", async () => {
    const { runtime, drawBiomes } = makeRuntime({
      getDefault: () => ({ name: ["X"] }),
      recalculatePopulation: () => false,
    });
    const tool = createRestoreDefaultBiomesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.drew).toBe(true);
    expect(parsed.recalculated_population).toBe(false);
    expect(drawBiomes).toHaveBeenCalledTimes(1);
  });

  it("biomes_count: 0 when getDefault returns data without a name array", async () => {
    const { runtime } = makeRuntime({
      getDefault: () => ({ name: undefined }),
    });
    const tool = createRestoreDefaultBiomesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).biomes_count).toBe(0);
  });

  it("exposes the expected tool name and empty-input schema, and round-trips through ToolRegistry", () => {
    const { runtime } = makeRuntime();
    const tool = createRestoreDefaultBiomesTool(runtime);
    expect(tool.name).toBe("restore_default_biomes");
    expect(tool.input_schema.type).toBe("object");
    expect(tool.input_schema.properties).toEqual({});
    expect(
      (tool.input_schema as { required?: unknown }).required,
    ).toBeUndefined();

    const registry = new ToolRegistry();
    registry.register(restoreDefaultBiomesTool);
    expect(registry.list().map((t) => t.name)).toContain(
      "restore_default_biomes",
    );
  });

  it("ignores extraneous / nullish input", async () => {
    const { runtime, define } = makeRuntime({
      getDefault: () => ({ name: ["X"] }),
    });
    const tool = createRestoreDefaultBiomesTool(runtime);
    for (const input of [{}, null, undefined, { extra: "ignored" }]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
    }
    expect(define).toHaveBeenCalledTimes(4);
  });
});

describe("defaultRestoreDefaultBiomesRuntime (integration)", () => {
  const originalBiomes = (globalThis as { Biomes?: unknown }).Biomes;
  const originalBiomesData = (globalThis as { biomesData?: unknown })
    .biomesData;
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDrawBiomes = (globalThis as { drawBiomes?: unknown })
    .drawBiomes;
  const originalRecalc = (globalThis as { recalculatePopulation?: unknown })
    .recalculatePopulation;

  beforeEach(() => {
    (globalThis as { biomesData?: unknown }).biomesData = {
      name: ["A", "B"],
    };
    (globalThis as { Biomes?: unknown }).Biomes = {
      getDefault: vi.fn(() => ({ name: ["X"] })),
      define: vi.fn(),
    };
    (globalThis as { pack?: unknown }).pack = {
      cells: { biome: new Uint8Array([0, 1, 2, 3, 4]) },
    };
    (globalThis as { drawBiomes?: unknown }).drawBiomes = vi.fn();
    (globalThis as { recalculatePopulation?: unknown }).recalculatePopulation =
      vi.fn();
  });

  afterEach(() => {
    (globalThis as { Biomes?: unknown }).Biomes = originalBiomes;
    (globalThis as { biomesData?: unknown }).biomesData = originalBiomesData;
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { drawBiomes?: unknown }).drawBiomes = originalDrawBiomes;
    (globalThis as { recalculatePopulation?: unknown }).recalculatePopulation =
      originalRecalc;
  });

  it("calls Biomes.getDefault then Biomes.define and reassigns globalThis.biomesData (identity pin)", async () => {
    const defaultData = { i: [0, 1, 2], name: ["X", "Y", "Z"] };
    const cellBiome = new Uint8Array([0, 1, 2, 3, 4]);
    const defineFn = vi.fn(() => {
      cellBiome[1] = 7; // 1 cell changes
    });
    (globalThis as { biomesData?: unknown }).biomesData = { name: ["A", "B"] };
    (globalThis as { Biomes?: unknown }).Biomes = {
      getDefault: vi.fn(() => defaultData),
      define: defineFn,
    };
    (globalThis as { pack?: unknown }).pack = {
      cells: { biome: cellBiome },
    };
    const drawBiomes = vi.fn();
    const recalc = vi.fn();
    (globalThis as { drawBiomes?: unknown }).drawBiomes = drawBiomes;
    (globalThis as { recalculatePopulation?: unknown }).recalculatePopulation =
      recalc;

    const result = await restoreDefaultBiomesTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      biomes_count: 3,
      cells_changed: 1,
      drew: true,
      recalculated_population: true,
    });
    // Load-bearing identity pin: REASSIGNMENT, not in-place mutation.
    expect((globalThis as { biomesData?: unknown }).biomesData).toBe(
      defaultData,
    );
    expect(defineFn).toHaveBeenCalledTimes(1);
    expect(drawBiomes).toHaveBeenCalledTimes(1);
    expect(recalc).toHaveBeenCalledTimes(1);
  });

  it("errors when the Biomes global is missing and leaves biomesData / pack.cells.biome unchanged", async () => {
    (globalThis as { Biomes?: unknown }).Biomes = undefined;
    const previousBiomesData = (globalThis as { biomesData?: unknown })
      .biomesData;
    const pack = (globalThis as { pack?: { cells?: { biome?: Uint8Array } } })
      .pack;
    const previousCellBiomes = Array.from(pack?.cells?.biome ?? []);
    const result = await restoreDefaultBiomesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Biomes\.getDefault/);
    expect((globalThis as { biomesData?: unknown }).biomesData).toBe(
      previousBiomesData,
    );
    expect(Array.from(pack?.cells?.biome ?? [])).toEqual(previousCellBiomes);
  });

  it("errors when Biomes.define is not callable (biomesData IS swapped — documented partial state)", async () => {
    const defaultData = { name: ["X"] };
    (globalThis as { Biomes?: unknown }).Biomes = {
      getDefault: vi.fn(() => defaultData),
      define: undefined,
    };
    const result = await restoreDefaultBiomesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Biomes\.define/);
    // Documented partial-state limitation: biomesData IS reassigned.
    expect((globalThis as { biomesData?: unknown }).biomesData).toBe(
      defaultData,
    );
  });

  it("errors when pack.cells.biome is missing and leaves biomesData unchanged", async () => {
    (globalThis as { pack?: unknown }).pack = { cells: {} };
    const previousBiomesData = (globalThis as { biomesData?: unknown })
      .biomesData;
    const result = await restoreDefaultBiomesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.cells\.biome/);
    expect((globalThis as { biomesData?: unknown }).biomesData).toBe(
      previousBiomesData,
    );
  });

  it("succeeds with drew: false when drawBiomes is missing", async () => {
    (globalThis as { drawBiomes?: unknown }).drawBiomes = undefined;
    const result = await restoreDefaultBiomesTool.execute({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.drew).toBe(false);
    expect(parsed.recalculated_population).toBe(true);
  });

  it("succeeds with drew: false when drawBiomes throws", async () => {
    (globalThis as { drawBiomes?: unknown }).drawBiomes = () => {
      throw new Error("x");
    };
    const result = await restoreDefaultBiomesTool.execute({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.drew).toBe(false);
    expect(parsed.recalculated_population).toBe(true);
  });

  it("succeeds with recalculated_population: false when recalculatePopulation is missing", async () => {
    (globalThis as { recalculatePopulation?: unknown }).recalculatePopulation =
      undefined;
    const result = await restoreDefaultBiomesTool.execute({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.drew).toBe(true);
    expect(parsed.recalculated_population).toBe(false);
  });

  it("succeeds with recalculated_population: false when recalculatePopulation throws", async () => {
    (globalThis as { recalculatePopulation?: unknown }).recalculatePopulation =
      () => {
        throw new Error("y");
      };
    const result = await restoreDefaultBiomesTool.execute({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.drew).toBe(true);
    expect(parsed.recalculated_population).toBe(false);
  });

  it("surfaces a thrown runtime error from getDefault; biomesData unchanged; define not invoked", async () => {
    const define = vi.fn();
    (globalThis as { Biomes?: unknown }).Biomes = {
      getDefault: () => {
        throw new Error("boom");
      },
      define,
    };
    const previousBiomesData = (globalThis as { biomesData?: unknown })
      .biomesData;
    const result = await restoreDefaultBiomesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("boom");
    expect(define).not.toHaveBeenCalled();
    expect((globalThis as { biomesData?: unknown }).biomesData).toBe(
      previousBiomesData,
    );
  });

  it("surfaces a thrown runtime error from define; biomesData IS swapped; draw / recalc skipped", async () => {
    const defaultData = { name: ["X"] };
    const drawBiomes = vi.fn();
    const recalc = vi.fn();
    (globalThis as { Biomes?: unknown }).Biomes = {
      getDefault: vi.fn(() => defaultData),
      define: () => {
        throw new Error("boom2");
      },
    };
    (globalThis as { drawBiomes?: unknown }).drawBiomes = drawBiomes;
    (globalThis as { recalculatePopulation?: unknown }).recalculatePopulation =
      recalc;
    const result = await restoreDefaultBiomesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("boom2");
    expect((globalThis as { biomesData?: unknown }).biomesData).toBe(
      defaultData,
    );
    expect(drawBiomes).not.toHaveBeenCalled();
    expect(recalc).not.toHaveBeenCalled();
  });
});
