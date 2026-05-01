import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createRecalculateReligionsTool,
  type RecalculateReligionsRuntime,
  recalculateReligionsTool,
} from "./recalculate-religions";

interface RuntimeBundle {
  runtime: RecalculateReligionsRuntime;
  snapshot: ReturnType<typeof vi.fn<() => number[] | null>>;
  recalculate: ReturnType<typeof vi.fn<() => void>>;
  drawReligions: ReturnType<typeof vi.fn<() => void>>;
  drawReligionCenters: ReturnType<typeof vi.fn<() => void>>;
}

function makeRuntime(opts: {
  snapshots?: Array<number[] | null>;
  recalculate?: () => void;
  drawReligions?: () => void;
  drawReligionCenters?: () => void;
}): RuntimeBundle {
  const sequence = [...(opts.snapshots ?? [])];
  const snapshot = vi.fn<() => number[] | null>(() => {
    if (sequence.length === 0) {
      throw new Error("snapshot called more times than sequence");
    }
    return sequence.shift() as number[] | null;
  });
  const recalculate = vi.fn<() => void>(opts.recalculate);
  const drawReligions = vi.fn<() => void>(opts.drawReligions);
  const drawReligionCenters = vi.fn<() => void>(opts.drawReligionCenters);
  return {
    runtime: { snapshot, recalculate, drawReligions, drawReligionCenters },
    snapshot,
    recalculate,
    drawReligions,
    drawReligionCenters,
  };
}

describe("recalculate_religions tool", () => {
  it("snapshots before recalc, computes cells_changed, calls draws in order", async () => {
    const {
      runtime,
      snapshot,
      recalculate,
      drawReligions,
      drawReligionCenters,
    } = makeRuntime({
      snapshots: [
        [0, 0, 1, 1, 2, 2],
        [0, 1, 1, 2, 2, 2],
      ],
    });
    const tool = createRecalculateReligionsTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();

    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(recalculate).toHaveBeenCalledTimes(1);
    expect(drawReligions).toHaveBeenCalledTimes(1);
    expect(drawReligionCenters).toHaveBeenCalledTimes(1);

    // Order: snapshot[0] < recalculate[0] < snapshot[1] < drawReligions[0] < drawReligionCenters[0]
    const s0 = snapshot.mock.invocationCallOrder[0];
    const s1 = snapshot.mock.invocationCallOrder[1];
    const rc = recalculate.mock.invocationCallOrder[0];
    const dr = drawReligions.mock.invocationCallOrder[0];
    const dc = drawReligionCenters.mock.invocationCallOrder[0];
    expect(s0).toBeDefined();
    expect(s1).toBeDefined();
    expect(rc).toBeDefined();
    expect(dr).toBeDefined();
    expect(dc).toBeDefined();
    expect(s0 as number).toBeLessThan(rc as number);
    expect(rc as number).toBeLessThan(s1 as number);
    expect(s1 as number).toBeLessThan(dr as number);
    expect(dr as number).toBeLessThan(dc as number);

    // BEFORE [0,0,1,1,2,2] vs AFTER [0,1,1,2,2,2]: indices 1 and 3 differ.
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      cells_changed: 2,
      previous_distribution: { "0": 2, "1": 2, "2": 2 },
      distribution: { "0": 1, "1": 2, "2": 3 },
    });
  });

  it("captures previous_distribution BEFORE recalc runs", async () => {
    // BEFORE: [0,0,1] → { "0":2, "1":1 }. AFTER: [1,1,1] → { "1":3 }.
    // If the implementation captured AFTER for previous_distribution
    // (a regression), it would get { "1":3 } instead of { "0":2, "1":1 }.
    const { runtime } = makeRuntime({
      snapshots: [
        [0, 0, 1],
        [1, 1, 1],
      ],
    });
    const tool = createRecalculateReligionsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.previous_distribution).toEqual({ "0": 2, "1": 1 });
    expect(parsed.distribution).toEqual({ "1": 3 });
    expect(parsed.cells_changed).toBe(2);
  });

  it("returns cells_changed=0 when recalc didn't change anything", async () => {
    const { runtime, drawReligions, drawReligionCenters } = makeRuntime({
      snapshots: [
        [0, 0, 1, 1],
        [0, 0, 1, 1],
      ],
    });
    const tool = createRecalculateReligionsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      cells_changed: 0,
      previous_distribution: { "0": 2, "1": 2 },
      distribution: { "0": 2, "1": 2 },
    });
    expect(drawReligions).toHaveBeenCalledTimes(1);
    expect(drawReligionCenters).toHaveBeenCalledTimes(1);
  });

  it("errors when snapshot returns null (pack/cells/religion missing)", async () => {
    const { runtime, recalculate, drawReligions, drawReligionCenters } =
      makeRuntime({
        snapshots: [null],
      });
    const tool = createRecalculateReligionsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack is not available; the map hasn't finished loading.",
    );
    expect(recalculate).not.toHaveBeenCalled();
    expect(drawReligions).not.toHaveBeenCalled();
    expect(drawReligionCenters).not.toHaveBeenCalled();
  });

  it("surfaces a Religions.recalculate-missing error and skips draws + post-snapshot", async () => {
    const { runtime, snapshot, drawReligions, drawReligionCenters } =
      makeRuntime({
        snapshots: [[0, 1]],
        recalculate: () => {
          throw new Error(
            "Religions.recalculate is not available; the map hasn't finished loading.",
          );
        },
      });
    const tool = createRecalculateReligionsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Religions.recalculate is not available; the map hasn't finished loading.",
    );
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(drawReligions).not.toHaveBeenCalled();
    expect(drawReligionCenters).not.toHaveBeenCalled();
  });

  it("surfaces an arbitrary recalculate runtime error", async () => {
    const { runtime, drawReligions, drawReligionCenters } = makeRuntime({
      snapshots: [[0, 1]],
      recalculate: () => {
        throw new Error("boom");
      },
    });
    const tool = createRecalculateReligionsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("boom");
    expect(drawReligions).not.toHaveBeenCalled();
    expect(drawReligionCenters).not.toHaveBeenCalled();
  });

  it("swallows drawReligions failure and still calls drawReligionCenters", async () => {
    const { runtime, drawReligions, drawReligionCenters } = makeRuntime({
      snapshots: [
        [0, 0, 1],
        [0, 1, 1],
      ],
      drawReligions: () => {
        throw new Error("draw exploded");
      },
    });
    const tool = createRecalculateReligionsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      cells_changed: 1,
      previous_distribution: { "0": 2, "1": 1 },
      distribution: { "0": 1, "1": 2 },
    });
    expect(drawReligions).toHaveBeenCalledTimes(1);
    // Critical: a single shared try/catch around both draws would skip
    // drawReligionCenters when drawReligions throws. This pins the
    // per-draw try/catch contract.
    expect(drawReligionCenters).toHaveBeenCalledTimes(1);
  });

  it("swallows drawReligionCenters failure", async () => {
    const { runtime } = makeRuntime({
      snapshots: [
        [0, 0],
        [1, 1],
      ],
      drawReligionCenters: () => {
        throw new Error("centers exploded");
      },
    });
    const tool = createRecalculateReligionsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).ok).toBe(true);
  });

  it("exposes the expected name + empty input schema and round-trips through the registry", () => {
    const { runtime } = makeRuntime({ snapshots: [] });
    const tool = createRecalculateReligionsTool(runtime);
    expect(tool.name).toBe("recalculate_religions");
    expect(tool.input_schema.type).toBe("object");
    expect(tool.input_schema.properties).toEqual({});
    expect(
      (tool.input_schema as { required?: unknown }).required,
    ).toBeUndefined();

    const registry = new ToolRegistry();
    registry.register(recalculateReligionsTool);
    expect(registry.list().map((t) => t.name)).toContain(
      "recalculate_religions",
    );
  });

  it("ignores extraneous / nullish input", async () => {
    for (const input of [{}, null, undefined, { extra: "ignored" }]) {
      const { runtime } = makeRuntime({
        snapshots: [
          [0, 1],
          [1, 1],
        ],
      });
      const tool = createRecalculateReligionsTool(runtime);
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content);
      expect(parsed.ok).toBe(true);
      expect(parsed.cells_changed).toBe(1);
    }
  });

  it("handles empty cells.religion with empty histograms", async () => {
    const { runtime } = makeRuntime({
      snapshots: [[], []],
    });
    const tool = createRecalculateReligionsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      cells_changed: 0,
      previous_distribution: {},
      distribution: {},
    });
  });
});

describe("defaultRecalculateReligionsRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalReligions = (globalThis as { Religions?: unknown }).Religions;
  const originalDraw = (globalThis as { drawReligions?: unknown })
    .drawReligions;
  const originalCenters = (globalThis as { drawReligionCenters?: unknown })
    .drawReligionCenters;

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Religions?: unknown }).Religions = originalReligions;
    (globalThis as { drawReligions?: unknown }).drawReligions = originalDraw;
    (globalThis as { drawReligionCenters?: unknown }).drawReligionCenters =
      originalCenters;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = undefined;
    (globalThis as { Religions?: unknown }).Religions = undefined;
    (globalThis as { drawReligions?: unknown }).drawReligions = undefined;
    (globalThis as { drawReligionCenters?: unknown }).drawReligionCenters =
      undefined;
  });

  it("invokes Religions.recalculate, drawReligions, drawReligionCenters and reports diff", async () => {
    (globalThis as { pack?: unknown }).pack = {
      cells: { religion: new Uint16Array([0, 0, 1, 1, 2]) },
    };
    const recalculate = vi.fn<() => void>(() => {
      (
        globalThis as { pack: { cells: { religion: Uint16Array } } }
      ).pack.cells.religion = new Uint16Array([0, 1, 1, 2, 2]);
    });
    (globalThis as { Religions?: unknown }).Religions = { recalculate };
    const drawReligions = vi.fn<() => void>();
    const drawReligionCenters = vi.fn<() => void>();
    (globalThis as { drawReligions?: unknown }).drawReligions = drawReligions;
    (globalThis as { drawReligionCenters?: unknown }).drawReligionCenters =
      drawReligionCenters;

    const result = await recalculateReligionsTool.execute({});
    expect(result.isError).toBeFalsy();

    expect(recalculate).toHaveBeenCalledTimes(1);
    expect(drawReligions).toHaveBeenCalledTimes(1);
    expect(drawReligionCenters).toHaveBeenCalledTimes(1);

    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      cells_changed: 2,
      previous_distribution: { "0": 2, "1": 2, "2": 1 },
      distribution: { "0": 1, "1": 2, "2": 2 },
    });
  });

  it("errors when Religions global is missing", async () => {
    (globalThis as { pack?: unknown }).pack = {
      cells: { religion: new Uint16Array([0, 1]) },
    };
    // Religions intentionally undefined.

    const result = await recalculateReligionsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Religions.recalculate is not available; the map hasn't finished loading.",
    );
  });

  it("errors when pack is missing entirely", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const result = await recalculateReligionsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack is not available; the map hasn't finished loading.",
    );
  });

  it("succeeds when drawReligions / drawReligionCenters are missing", async () => {
    (globalThis as { pack?: unknown }).pack = {
      cells: { religion: new Uint16Array([0, 1, 1]) },
    };
    const recalculate = vi.fn<() => void>(() => {
      (
        globalThis as { pack: { cells: { religion: Uint16Array } } }
      ).pack.cells.religion = new Uint16Array([0, 0, 1]);
    });
    (globalThis as { Religions?: unknown }).Religions = { recalculate };
    // drawReligions and drawReligionCenters intentionally undefined.

    const result = await recalculateReligionsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      cells_changed: 1,
      previous_distribution: { "0": 1, "1": 2 },
      distribution: { "0": 2, "1": 1 },
    });
  });
});
