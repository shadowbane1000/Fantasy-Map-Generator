import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pack, RawBurg } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createRecalculateCulturesTool,
  type RecalculateCulturesRuntime,
  recalculateCulturesTool,
} from "./recalculate-cultures";

interface RuntimeBundle {
  runtime: RecalculateCulturesRuntime;
  getPack: ReturnType<typeof vi.fn<() => Pack | undefined>>;
  expandCultures: ReturnType<typeof vi.fn<() => void>>;
  drawCultures: ReturnType<typeof vi.fn<() => void>>;
}

function makeRuntime(opts: {
  pack?: Pack | undefined;
  expand?: () => void;
  draw?: () => void;
}): RuntimeBundle {
  const getPack = vi.fn<() => Pack | undefined>(() => opts.pack);
  const expandCultures = vi.fn<() => void>(opts.expand ?? (() => {}));
  const drawCultures = vi.fn<() => void>(opts.draw ?? (() => {}));
  return {
    runtime: { getPack, expandCultures, drawCultures },
    getPack,
    expandCultures,
    drawCultures,
  };
}

describe("recalculate_cultures tool", () => {
  it("captures pre-distribution, calls expand → draw → burg-sync in order, computes counts", async () => {
    const cellsCulture = [0, 0, 1, 1, 2, 2, 0, 1];
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, name: "A", cell: 2, culture: 1 },
      { i: 2, name: "B", cell: 4, culture: 2 },
      { i: 3, name: "C", cell: 7, culture: 1 },
    ];
    const pack: Pack = {
      cells: { culture: cellsCulture },
      burgs,
    };
    const newCells = [0, 1, 1, 2, 2, 2, 0, 0];
    const { runtime, expandCultures, drawCultures } = makeRuntime({
      pack,
      expand: () => {
        for (let i = 0; i < newCells.length; i++) {
          cellsCulture[i] = newCells[i] as number;
        }
      },
    });
    const tool = createRecalculateCulturesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();

    expect(expandCultures).toHaveBeenCalledTimes(1);
    expect(drawCultures).toHaveBeenCalledTimes(1);
    const expandOrder = expandCultures.mock.invocationCallOrder[0];
    const drawOrder = drawCultures.mock.invocationCallOrder[0];
    expect(expandOrder).toBeDefined();
    expect(drawOrder).toBeDefined();
    expect(expandOrder as number).toBeLessThan(drawOrder as number);

    // Burgs synced from post-expand cell culture.
    expect(burgs[1]?.culture).toBe(1); // cell 2 → 1
    expect(burgs[2]?.culture).toBe(2); // cell 4 → 2
    expect(burgs[3]?.culture).toBe(0); // cell 7 → 0 (was 1)

    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      cells_changed: 3,
      burgs_changed: 1,
      previous_distribution: { "0": 3, "1": 3, "2": 2 },
      distribution: { "0": 3, "1": 2, "2": 3 },
    });
  });

  it("captures previous_distribution BEFORE expand runs (regression)", async () => {
    const cellsCulture = [0, 0, 0, 0, 1, 1, 1, 1];
    const pack: Pack = {
      cells: { culture: cellsCulture },
      burgs: [],
    };
    const { runtime } = makeRuntime({
      pack,
      // Mutate IN PLACE during expand — if implementation snapshotted
      // after expand, previous_distribution would equal distribution.
      expand: () => {
        cellsCulture[0] = 1;
        cellsCulture[1] = 1;
        cellsCulture[2] = 1;
      },
    });
    const tool = createRecalculateCulturesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();

    const body = JSON.parse(result.content);
    expect(body.previous_distribution).toEqual({ "0": 4, "1": 4 });
    expect(body.distribution).toEqual({ "0": 1, "1": 7 });
    expect(body.cells_changed).toBe(3);
    expect(body.burgs_changed).toBe(0);
    // Belt-and-suspenders: prove the two histograms ARE different.
    expect(body.previous_distribution).not.toEqual(body.distribution);
  });

  it("returns zero changes when expand is idempotent", async () => {
    const cellsCulture = [0, 1, 0, 1];
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, cell: 0, culture: 0 },
      { i: 2, cell: 1, culture: 1 },
    ];
    const pack: Pack = { cells: { culture: cellsCulture }, burgs };
    const { runtime, expandCultures, drawCultures } = makeRuntime({
      pack,
      expand: () => {},
    });
    const tool = createRecalculateCulturesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(expandCultures).toHaveBeenCalledTimes(1);
    expect(drawCultures).toHaveBeenCalledTimes(1);

    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      cells_changed: 0,
      burgs_changed: 0,
      previous_distribution: { "0": 2, "1": 2 },
      distribution: { "0": 2, "1": 2 },
    });
  });

  it("syncs burg.culture from POST-expand cell culture", async () => {
    const cellsCulture = [5, 5];
    const burg: RawBurg = { i: 1, cell: 0, culture: 5 };
    const pack: Pack = { cells: { culture: cellsCulture }, burgs: [burg] };
    const { runtime } = makeRuntime({
      pack,
      expand: () => {
        cellsCulture[0] = 9;
      },
    });
    const tool = createRecalculateCulturesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(burg.culture).toBe(9);
    expect(JSON.parse(result.content).burgs_changed).toBe(1);
  });

  it("skips burgs without a numeric cell", async () => {
    const cellsCulture = [3];
    const burgs: RawBurg[] = [
      { i: 0 }, // placeholder
      { i: 1, culture: 7 }, // no cell
      { i: 2, cell: 0, culture: 0 }, // syncable, will flip 0→3
    ];
    const pack: Pack = { cells: { culture: cellsCulture }, burgs };
    const { runtime } = makeRuntime({ pack });
    const tool = createRecalculateCulturesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(burgs[0]?.culture).toBeUndefined();
    expect(burgs[1]?.culture).toBe(7);
    expect(burgs[2]?.culture).toBe(3);
    expect(JSON.parse(result.content).burgs_changed).toBe(1);
  });

  it("errors when pack is missing", async () => {
    const { runtime, expandCultures, drawCultures } = makeRuntime({
      pack: undefined,
    });
    const tool = createRecalculateCulturesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack is not available; the map hasn't finished loading.",
    );
    expect(expandCultures).not.toHaveBeenCalled();
    expect(drawCultures).not.toHaveBeenCalled();
  });

  it("errors when pack.cells is missing", async () => {
    const { runtime, expandCultures, drawCultures } = makeRuntime({
      pack: { burgs: [] } as Pack,
    });
    const tool = createRecalculateCulturesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack is not available; the map hasn't finished loading.",
    );
    expect(expandCultures).not.toHaveBeenCalled();
    expect(drawCultures).not.toHaveBeenCalled();
  });

  it("errors when pack.cells.culture is missing", async () => {
    const { runtime, expandCultures, drawCultures } = makeRuntime({
      pack: { cells: {}, burgs: [] } as Pack,
    });
    const tool = createRecalculateCulturesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack is not available; the map hasn't finished loading.",
    );
    expect(expandCultures).not.toHaveBeenCalled();
    expect(drawCultures).not.toHaveBeenCalled();
  });

  it("errors when pack.burgs is missing", async () => {
    const { runtime, expandCultures, drawCultures } = makeRuntime({
      pack: { cells: { culture: [0, 1] } } as Pack,
    });
    const tool = createRecalculateCulturesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack is not available; the map hasn't finished loading.",
    );
    expect(expandCultures).not.toHaveBeenCalled();
    expect(drawCultures).not.toHaveBeenCalled();
  });

  it("propagates Cultures.expand-missing error and skips drawCultures + burg-sync", async () => {
    const cellsCulture = [0, 1, 0, 1];
    const burg: RawBurg = { i: 1, cell: 0, culture: 0 };
    const pack: Pack = { cells: { culture: cellsCulture }, burgs: [burg] };
    const { runtime, drawCultures } = makeRuntime({
      pack,
      expand: () => {
        throw new Error(
          "Cultures.expand is not available; the map hasn't finished loading.",
        );
      },
    });
    const tool = createRecalculateCulturesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Cultures.expand is not available; the map hasn't finished loading.",
    );
    expect(drawCultures).not.toHaveBeenCalled();
    // Cells unchanged (the stub threw before mutating).
    expect(cellsCulture).toEqual([0, 1, 0, 1]);
    // Burg unchanged.
    expect(burg.culture).toBe(0);
  });

  it("propagates drawCultures-missing error; cells already mutated; burgs NOT synced", async () => {
    const cellsCulture = [0, 0];
    const burg: RawBurg = { i: 1, cell: 0, culture: 0 };
    const pack: Pack = { cells: { culture: cellsCulture }, burgs: [burg] };
    const { runtime } = makeRuntime({
      pack,
      expand: () => {
        cellsCulture[0] = 7;
      },
      draw: () => {
        throw new Error("window.drawCultures is not available.");
      },
    });
    const tool = createRecalculateCulturesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.drawCultures is not available.",
    );
    // No rollback: cells ARE mutated.
    expect(cellsCulture[0]).toBe(7);
    // Burg sync did NOT run (loop is short-circuited by the error).
    expect(burg.culture).toBe(0);
  });

  it("surfaces an arbitrary expand runtime error", async () => {
    const pack: Pack = { cells: { culture: [0] }, burgs: [] };
    const { runtime, drawCultures } = makeRuntime({
      pack,
      expand: () => {
        throw new Error("boom");
      },
    });
    const tool = createRecalculateCulturesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("boom");
    expect(drawCultures).not.toHaveBeenCalled();
  });

  it("exposes the expected name + empty input schema and round-trips through the registry", () => {
    const { runtime } = makeRuntime({
      pack: { cells: { culture: [] }, burgs: [] },
    });
    const tool = createRecalculateCulturesTool(runtime);
    expect(tool.name).toBe("recalculate_cultures");
    expect(tool.input_schema.type).toBe("object");
    expect(tool.input_schema.properties).toEqual({});
    expect(
      (tool.input_schema as { required?: unknown }).required,
    ).toBeUndefined();

    const registry = new ToolRegistry();
    registry.register(recalculateCulturesTool);
    expect(registry.list().map((t) => t.name)).toContain(
      "recalculate_cultures",
    );
  });

  it("ignores extraneous / nullish input", async () => {
    const pack: Pack = { cells: { culture: [0] }, burgs: [] };
    const { runtime, expandCultures, drawCultures } = makeRuntime({ pack });
    const tool = createRecalculateCulturesTool(runtime);
    for (const input of [{}, null, undefined, { extra: "ignored" }]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
    }
    expect(expandCultures).toHaveBeenCalledTimes(4);
    expect(drawCultures).toHaveBeenCalledTimes(4);
  });
});

describe("defaultRecalculateCulturesRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalCultures = (globalThis as { Cultures?: unknown }).Cultures;
  const originalDraw = (globalThis as { drawCultures?: unknown }).drawCultures;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = undefined;
    (globalThis as { Cultures?: unknown }).Cultures = undefined;
    (globalThis as { drawCultures?: unknown }).drawCultures = undefined;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Cultures?: unknown }).Cultures = originalCultures;
    (globalThis as { drawCultures?: unknown }).drawCultures = originalDraw;
    vi.restoreAllMocks();
  });

  it("invokes Cultures.expand, drawCultures, and syncs burgs end-to-end", async () => {
    const cellsCulture = [0, 0, 1, 1];
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, cell: 1, culture: 0 },
      { i: 2, cell: 3, culture: 1 },
    ];
    (globalThis as { pack?: unknown }).pack = {
      cells: { culture: cellsCulture },
      burgs,
    };
    const expand = vi.fn(() => {
      cellsCulture[1] = 1;
      cellsCulture[3] = 0;
    });
    const draw = vi.fn();
    (globalThis as { Cultures?: unknown }).Cultures = { expand };
    (globalThis as { drawCultures?: unknown }).drawCultures = draw;

    const result = await recalculateCulturesTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(expand).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(burgs[1]?.culture).toBe(1);
    expect(burgs[2]?.culture).toBe(0);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      cells_changed: 2,
      burgs_changed: 2,
      previous_distribution: { "0": 2, "1": 2 },
      distribution: { "0": 2, "1": 2 },
    });
  });

  it("errors when globalThis.Cultures.expand is missing", async () => {
    const cellsCulture = [0, 1];
    (globalThis as { pack?: unknown }).pack = {
      cells: { culture: cellsCulture },
      burgs: [{ i: 1, cell: 0, culture: 0 }],
    };
    (globalThis as { Cultures?: unknown }).Cultures = undefined;
    (globalThis as { drawCultures?: unknown }).drawCultures = vi.fn();

    const result = await recalculateCulturesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Cultures.expand is not available; the map hasn't finished loading.",
    );
    // Cells unchanged.
    expect(cellsCulture).toEqual([0, 1]);
  });

  it("errors when globalThis.drawCultures is missing; expand was called", async () => {
    const cellsCulture = [0, 0];
    (globalThis as { pack?: unknown }).pack = {
      cells: { culture: cellsCulture },
      burgs: [],
    };
    const expand = vi.fn();
    (globalThis as { Cultures?: unknown }).Cultures = { expand };
    (globalThis as { drawCultures?: unknown }).drawCultures = undefined;

    const result = await recalculateCulturesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.drawCultures is not available.",
    );
    expect(expand).toHaveBeenCalledTimes(1);
  });

  it("errors when globalThis.pack is missing entirely", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const expand = vi.fn();
    const draw = vi.fn();
    (globalThis as { Cultures?: unknown }).Cultures = { expand };
    (globalThis as { drawCultures?: unknown }).drawCultures = draw;

    const result = await recalculateCulturesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack is not available; the map hasn't finished loading.",
    );
    expect(expand).not.toHaveBeenCalled();
    expect(draw).not.toHaveBeenCalled();
  });
});
