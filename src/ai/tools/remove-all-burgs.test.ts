import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createRemoveAllBurgsTool,
  type RemoveAllBurgsRuntime,
  removeAllBurgsTool,
} from "./remove-all-burgs";

interface MakeRuntimeOpts {
  burgs?: RawBurg[] | undefined | unknown;
  getBurgsThrows?: Error;
  removeBurg?: (i: number) => void;
  addLines?: () => void;
  /** Default true. Set false to omit `addLines` from the runtime. */
  includeAddLines?: boolean;
}

function makeRuntime(opts: MakeRuntimeOpts = {}) {
  const burgsRef = opts.burgs as RawBurg[] | undefined;
  const getBurgs = vi.fn(() => {
    if (opts.getBurgsThrows) throw opts.getBurgsThrows;
    return burgsRef;
  });
  const defaultRemoveBurg = (i: number) => {
    const arr = burgsRef as RawBurg[] | undefined;
    if (!Array.isArray(arr)) return;
    const burg = arr[i];
    if (!burg) return;
    burg.removed = true;
  };
  const removeBurg = vi.fn(opts.removeBurg ?? defaultRemoveBurg);
  const addLines = vi.fn(opts.addLines ?? (() => {}));
  const runtime: RemoveAllBurgsRuntime = {
    getBurgs,
    removeBurg,
    ...(opts.includeAddLines === false ? {} : { addLines }),
  };
  return { runtime, getBurgs, removeBurg, addLines };
}

describe("remove_all_burgs tool", () => {
  it("happy path: 6 active burgs (2 capitals, 1 locked, 1 locked+capital, 2 normal) → 2 removed", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, name: "Cap1", capital: 1 },
      { i: 2, name: "Cap2", capital: 1 },
      { i: 3, name: "Locked", lock: true },
      { i: 4, name: "LockedCap", capital: 1, lock: true },
      { i: 5, name: "Norm5" },
      { i: 6, name: "Norm6" },
    ];
    const { runtime, removeBurg, addLines } = makeRuntime({ burgs });
    const tool = createRemoveAllBurgsTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();

    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 6,
      removed_count: 2,
      skipped_capital: 3,
      skipped_locked: 1,
      removed_burg_ids: [5, 6],
      removed_burg_ids_truncated: false,
    });

    expect(removeBurg.mock.calls.flat()).toEqual([5, 6]);
    expect(removeBurg.mock.calls.flat()).not.toContain(0);
    expect(removeBurg.mock.calls.flat()).not.toContain(1);
    expect(removeBurg.mock.calls.flat()).not.toContain(2);
    expect(removeBurg.mock.calls.flat()).not.toContain(3);
    expect(removeBurg.mock.calls.flat()).not.toContain(4);

    expect(addLines).toHaveBeenCalledTimes(1);
  });

  it("skip precedence: capital wins over locked (single burg both flags)", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, capital: 1, lock: true }];
    const { runtime, removeBurg } = makeRuntime({ burgs });
    const tool = createRemoveAllBurgsTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 1,
      removed_count: 0,
      skipped_capital: 1,
      skipped_locked: 0,
      removed_burg_ids: [],
      removed_burg_ids_truncated: false,
    });
    expect(removeBurg).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "all normal",
      burgs: [
        { i: 0 },
        { i: 1, name: "A" },
        { i: 2, name: "B" },
        { i: 3, name: "C" },
      ] as RawBurg[],
    },
    {
      label: "all capitals",
      burgs: [
        { i: 0 },
        { i: 1, capital: 1 },
        { i: 2, capital: 1 },
      ] as RawBurg[],
    },
    {
      label: "all locked",
      burgs: [
        { i: 0 },
        { i: 1, lock: true },
        { i: 2, lock: true },
      ] as RawBurg[],
    },
    {
      label: "mixed",
      burgs: [
        { i: 0 },
        { i: 1, capital: 1 },
        { i: 2, lock: true },
        { i: 3, capital: 1, lock: true },
        { i: 4, name: "Norm" },
      ] as RawBurg[],
    },
    {
      label: "empty active",
      burgs: [{ i: 0 }, { i: 1, removed: true }] as RawBurg[],
    },
  ])("invariant: previous_count = removed_count + skipped_capital + skipped_locked ($label)", async ({
    burgs,
  }) => {
    const { runtime } = makeRuntime({ burgs });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(
      body.removed_count + body.skipped_capital + body.skipped_locked,
    ).toBe(body.previous_count);
  });

  it("burg 0 untouched (LOAD-BEARING)", async () => {
    const burgs: RawBurg[] = [
      { i: 0, name: "Placeholder" },
      { i: 1, name: "A" },
    ];
    const { runtime, removeBurg } = makeRuntime({ burgs });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(removeBurg.mock.calls.flat()).toEqual([1]);
    expect(removeBurg.mock.calls.flat()).not.toContain(0);
    expect(JSON.parse(result.content).previous_count).toBe(1);
  });

  it("already-removed burgs not re-removed (LOAD-BEARING)", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, removed: true, name: "Gone" },
      { i: 2, name: "Norm" },
    ];
    const { runtime, removeBurg } = makeRuntime({ burgs });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 1,
      removed_count: 1,
      skipped_capital: 0,
      skipped_locked: 0,
      removed_burg_ids: [2],
      removed_burg_ids_truncated: false,
    });
    expect(removeBurg.mock.calls.flat()).toEqual([2]);
    expect(removeBurg.mock.calls.flat()).not.toContain(1);
  });

  it("all capitals → no removal", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, capital: 1 },
      { i: 2, capital: 1 },
    ];
    const { runtime, removeBurg } = makeRuntime({ burgs });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 2,
      removed_count: 0,
      skipped_capital: 2,
      skipped_locked: 0,
      removed_burg_ids: [],
      removed_burg_ids_truncated: false,
    });
    expect(removeBurg).not.toHaveBeenCalled();
  });

  it("all locked → no removal", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, lock: true },
      { i: 2, lock: true },
    ];
    const { runtime, removeBurg } = makeRuntime({ burgs });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 2,
      removed_count: 0,
      skipped_capital: 0,
      skipped_locked: 2,
      removed_burg_ids: [],
      removed_burg_ids_truncated: false,
    });
    expect(removeBurg).not.toHaveBeenCalled();
  });

  it("empty active set (only burg 0 + only removed) → all-zero counts", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, removed: true }];
    const { runtime, removeBurg } = makeRuntime({ burgs });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 0,
      removed_count: 0,
      skipped_capital: 0,
      skipped_locked: 0,
      removed_burg_ids: [],
      removed_burg_ids_truncated: false,
    });
    expect(removeBurg).not.toHaveBeenCalled();
  });

  it("call ORDER: removeBurg invoked once per target in id-ascending order", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, name: "A" },
      { i: 2, capital: 1 },
      { i: 3, name: "C" },
      { i: 4, lock: true },
      { i: 5, name: "E" },
    ];
    const { runtime, removeBurg } = makeRuntime({ burgs });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(removeBurg.mock.calls.flat()).toEqual([1, 3, 5]);
  });

  it("missing pack.burgs → exact verbatim error; no calls", async () => {
    const { runtime, removeBurg, addLines } = makeRuntime({
      burgs: undefined,
    });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.burgs is not available; the map hasn't finished loading.",
    );
    expect(removeBurg).not.toHaveBeenCalled();
    expect(addLines).not.toHaveBeenCalled();
  });

  it("non-array pack.burgs → same error", async () => {
    const { runtime } = makeRuntime({
      burgs: "oops" as unknown as RawBurg[],
    });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.burgs is not available; the map hasn't finished loading.",
    );
  });

  it("missing Burgs.remove → exact verbatim error; addLines not called", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, name: "A" }];
    const { runtime, addLines } = makeRuntime({
      burgs,
      removeBurg: () => {
        throw new Error(
          "window.Burgs.remove is not available; the map hasn't finished loading.",
        );
      },
    });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.Burgs.remove is not available; the map hasn't finished loading.",
    );
    expect(addLines).not.toHaveBeenCalled();
  });

  it("removeBurg throws on second burg → error; partial state preserved; addLines not called", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, name: "A" },
      { i: 2, name: "B" },
      { i: 3, name: "C" },
    ];
    let calls = 0;
    const { runtime, addLines } = makeRuntime({
      burgs,
      removeBurg: (i: number) => {
        calls++;
        if (calls === 2) throw new Error("dom!");
        burgs[i].removed = true;
      },
    });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/dom!/);
    // Work that completed before the throw stays applied.
    expect(burgs[1].removed).toBe(true);
    // The throwing call's mock didn't mutate.
    expect(burgs[2].removed).toBeUndefined();
    // Never reached.
    expect(burgs[3].removed).toBeUndefined();
    // addLines short-circuited.
    expect(addLines).not.toHaveBeenCalled();
  });

  it("removed_burg_ids capped at 50; truncated=true for 70 burgs", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      ...Array.from({ length: 70 }, (_, k) => ({
        i: k + 1,
        name: `B${k + 1}`,
      })),
    ];
    const { runtime } = makeRuntime({ burgs });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    expect(body.previous_count).toBe(70);
    expect(body.removed_count).toBe(70);
    expect(body.removed_burg_ids).toHaveLength(50);
    expect(body.removed_burg_ids[0]).toBe(1);
    expect(body.removed_burg_ids[49]).toBe(50);
    expect(body.removed_burg_ids_truncated).toBe(true);
  });

  it("boundary: exactly 50 → not truncated", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      ...Array.from({ length: 50 }, (_, k) => ({
        i: k + 1,
        name: `B${k + 1}`,
      })),
    ];
    const { runtime } = makeRuntime({ burgs });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    expect(body.removed_burg_ids).toHaveLength(50);
    expect(body.removed_burg_ids_truncated).toBe(false);
  });

  it("removed_burg_ids ascending regardless of input order", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 5, name: "E" },
      { i: 1, name: "A" },
      { i: 9, name: "I" },
      { i: 3, name: "C" },
    ];
    const { runtime } = makeRuntime({ burgs });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(JSON.parse(result.content).removed_burg_ids).toEqual([1, 3, 5, 9]);
  });

  it("addLines absent → no error", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1 }];
    const { runtime } = makeRuntime({ burgs, includeAddLines: false });
    expect(runtime.addLines).toBeUndefined();
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
  });

  it("addLines throws → swallowed; result still ok; mutation applied", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1 }];
    const { runtime, removeBurg } = makeRuntime({
      burgs,
      addLines: () => {
        throw new Error("svg!");
      },
    });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(removeBurg.mock.calls.flat()).toEqual([1]);
  });

  it("getBurgs() throws → error propagated; removeBurg not called", async () => {
    const { runtime, removeBurg } = makeRuntime({
      getBurgsThrows: new Error("boom"),
    });
    const tool = createRemoveAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/boom/);
    expect(removeBurg).not.toHaveBeenCalled();
  });

  it("tool name + schema + registry round-trip", () => {
    expect(removeAllBurgsTool.name).toBe("remove_all_burgs");
    expect(removeAllBurgsTool.input_schema).toEqual({
      type: "object",
      properties: {},
    });
    const reg = new ToolRegistry();
    reg.register(removeAllBurgsTool);
    expect(reg.list().map((t) => t.name)).toContain("remove_all_burgs");
  });

  it("tolerates extraneous / null / undefined input", async () => {
    const make = () =>
      createRemoveAllBurgsTool(makeRuntime({ burgs: [{ i: 0 }] }).runtime);
    expect((await make().execute({ bogus: "x" })).isError).toBeFalsy();
    expect((await make().execute(null)).isError).toBeFalsy();
    expect((await make().execute(undefined)).isError).toBeFalsy();
  });
});

describe("defaultRemoveAllBurgsRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalBurgs = (globalThis as { Burgs?: unknown }).Burgs;
  const originalAddLines = (globalThis as { burgsOverviewAddLines?: unknown })
    .burgsOverviewAddLines;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = undefined;
    (globalThis as { Burgs?: unknown }).Burgs = undefined;
    (globalThis as { burgsOverviewAddLines?: unknown }).burgsOverviewAddLines =
      undefined;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Burgs?: unknown }).Burgs = originalBurgs;
    (globalThis as { burgsOverviewAddLines?: unknown }).burgsOverviewAddLines =
      originalAddLines;
  });

  it("end-to-end with populated globals", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, capital: 1, name: "Cap" },
      { i: 2, lock: true, name: "Locked" },
      { i: 3, name: "N3" },
      { i: 4, name: "N4" },
    ];
    (globalThis as { pack?: unknown }).pack = { burgs };
    const removeSpy = vi.fn((i: number) => {
      burgs[i].removed = true;
    });
    (globalThis as { Burgs?: unknown }).Burgs = { remove: removeSpy };
    const addLinesSpy = vi.fn();
    (globalThis as { burgsOverviewAddLines?: unknown }).burgsOverviewAddLines =
      addLinesSpy;

    const result = await removeAllBurgsTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 4,
      removed_count: 2,
      skipped_capital: 1,
      skipped_locked: 1,
      removed_burg_ids: [3, 4],
      removed_burg_ids_truncated: false,
    });
    expect(removeSpy.mock.calls.flat()).toEqual([3, 4]);
    expect(removeSpy.mock.calls.flat()).not.toContain(0);
    expect(removeSpy.mock.calls.flat()).not.toContain(1);
    expect(removeSpy.mock.calls.flat()).not.toContain(2);
    expect(burgs[1].removed).toBeFalsy();
    expect(burgs[2].removed).toBeFalsy();
    expect(burgs[3].removed).toBe(true);
    expect(burgs[4].removed).toBe(true);
    expect(addLinesSpy).toHaveBeenCalledTimes(1);
  });

  it("integration: missing pack → error", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const result = await removeAllBurgsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.pack\.burgs is not available/,
    );
  });

  it("integration: pack.burgs missing → same error", async () => {
    (globalThis as { pack?: unknown }).pack = {};
    const result = await removeAllBurgsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.pack\.burgs is not available/,
    );
  });

  it("integration: missing Burgs global → exact remove-validation error; burg untouched", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, name: "A" }];
    (globalThis as { pack?: unknown }).pack = { burgs };
    (globalThis as { Burgs?: unknown }).Burgs = undefined;

    const result = await removeAllBurgsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.Burgs\.remove is not available/,
    );
    expect(burgs[1].removed).toBeFalsy();
  });

  it("integration: Burgs.remove not a function → same error", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, name: "A" }];
    (globalThis as { pack?: unknown }).pack = { burgs };
    (globalThis as { Burgs?: unknown }).Burgs = { remove: "nope" };

    const result = await removeAllBurgsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.Burgs\.remove is not available/,
    );
    expect(burgs[1].removed).toBeFalsy();
  });

  it("integration: burgsOverviewAddLines absent → tool succeeds; mutation applied", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, name: "A" }];
    (globalThis as { pack?: unknown }).pack = { burgs };
    (globalThis as { Burgs?: unknown }).Burgs = {
      remove: vi.fn((i: number) => {
        burgs[i].removed = true;
      }),
    };
    (globalThis as { burgsOverviewAddLines?: unknown }).burgsOverviewAddLines =
      undefined;

    const result = await removeAllBurgsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(burgs[1].removed).toBe(true);
  });

  it("integration: burgsOverviewAddLines throws → swallowed; mutation applied", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, name: "A" }];
    (globalThis as { pack?: unknown }).pack = { burgs };
    (globalThis as { Burgs?: unknown }).Burgs = {
      remove: vi.fn((i: number) => {
        burgs[i].removed = true;
      }),
    };
    (globalThis as { burgsOverviewAddLines?: unknown }).burgsOverviewAddLines =
      vi.fn(() => {
        throw new Error("ui!");
      });

    const result = await removeAllBurgsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(burgs[1].removed).toBe(true);
  });
});
