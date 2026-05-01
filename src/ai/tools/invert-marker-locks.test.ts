import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMarker } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createInvertMarkerLocksTool,
  type InvertMarkerLocksRuntime,
  invertMarkerLocksTool,
} from "./invert-marker-locks";

interface MakeRuntimeOpts {
  markers?: RawMarker[] | undefined | unknown;
  addLines?: () => void;
  setMarkers?: (arr: RawMarker[]) => void;
  getMarkersThrows?: Error;
  setMarkersThrows?: Error;
}

function makeRuntime(opts: MakeRuntimeOpts = {}) {
  let stored: RawMarker[] | undefined;
  const setMarkers = vi.fn((arr: RawMarker[]) => {
    if (opts.setMarkersThrows) throw opts.setMarkersThrows;
    if (opts.setMarkers) opts.setMarkers(arr);
    stored = arr;
  });
  const addLines = opts.addLines ? vi.fn(opts.addLines) : undefined;
  const getMarkers = vi.fn(() => {
    if (opts.getMarkersThrows) throw opts.getMarkersThrows;
    return opts.markers as RawMarker[] | undefined;
  });
  const runtime: InvertMarkerLocksRuntime = {
    getMarkers,
    setMarkers,
    addLines,
  };
  return {
    runtime,
    getMarkers,
    setMarkers,
    addLines,
    getStored: () => stored,
  };
}

describe("invert_marker_locks tool", () => {
  it("happy path (mixed): 3 markers (true, false, undefined) → false, true, true", async () => {
    const markers: RawMarker[] = [
      { i: 1, lock: true },
      { i: 2, lock: false },
      { i: 3 },
    ];
    const { runtime, setMarkers, getStored } = makeRuntime({ markers });
    const tool = createInvertMarkerLocksTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 3,
      now_locked: 2,
      now_unlocked: 1,
    });
    expect(setMarkers.mock.calls.length).toBe(1);
    const stored = getStored();
    expect(stored).toBeDefined();
    expect(stored?.[0].lock).toBe(false);
    expect(stored?.[1].lock).toBe(true);
    expect(stored?.[2].lock).toBe(true);
  });

  it("all locked → all unlocked", async () => {
    const markers: RawMarker[] = [
      { i: 1, lock: true },
      { i: 2, lock: true },
      { i: 3, lock: true },
    ];
    const { runtime, getStored } = makeRuntime({ markers });
    const tool = createInvertMarkerLocksTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 3,
      now_locked: 0,
      now_unlocked: 3,
    });
    for (const m of getStored() ?? []) {
      expect(m.lock).toBe(false);
    }
  });

  it("all unlocked (mixed undefined / false) → all locked (LOAD-BEARING !undefined === true)", async () => {
    const markers: RawMarker[] = [{ i: 1 }, { i: 2, lock: false }, { i: 3 }];
    const { runtime, getStored } = makeRuntime({ markers });
    const tool = createInvertMarkerLocksTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 3,
      now_locked: 3,
      now_unlocked: 0,
    });
    for (const m of getStored() ?? []) {
      expect(m.lock).toBe(true);
    }
  });

  it("REASSIGNMENT — pack.markers identity changes (LOAD-BEARING)", async () => {
    const markers: RawMarker[] = [{ i: 1, lock: true }, { i: 2 }];
    const before = markers;
    const { runtime, setMarkers, getStored } = makeRuntime({ markers });
    const tool = createInvertMarkerLocksTool(runtime);
    await tool.execute({});
    expect(getStored()).not.toBe(before);
    expect(setMarkers.mock.calls[0][0]).not.toBe(before);
  });

  it("cloned-not-mutated — original marker objects survive unchanged (LOAD-BEARING)", async () => {
    const m1: RawMarker = { i: 1, lock: true };
    const m2: RawMarker = { i: 2 };
    const markers: RawMarker[] = [m1, m2];
    const { runtime, getStored } = makeRuntime({ markers });
    const tool = createInvertMarkerLocksTool(runtime);
    await tool.execute({});
    // Originals untouched.
    expect(m1.lock).toBe(true);
    expect(m2.lock).toBeUndefined();
    expect("lock" in m2).toBe(false);
    // Clones are different references.
    expect(getStored()?.[0]).not.toBe(m1);
    expect(getStored()?.[1]).not.toBe(m2);
  });

  it("preserves all other fields on each new clone", async () => {
    const marker: RawMarker = {
      i: 7,
      type: "monster",
      icon: "?",
      x: 100,
      y: 200,
      cell: 42,
      dx: 1,
      dy: 2,
      px: 3,
      size: 16,
      pin: "bubble",
      fill: "#fff",
      stroke: "#000",
      pinned: true,
      lock: false,
      removed: false,
    };
    const markers: RawMarker[] = [marker];
    const { runtime, getStored } = makeRuntime({ markers });
    const tool = createInvertMarkerLocksTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const clone = getStored()?.[0];
    expect(clone).toBeDefined();
    expect(clone?.i).toBe(7);
    expect(clone?.type).toBe("monster");
    expect(clone?.icon).toBe("?");
    expect(clone?.x).toBe(100);
    expect(clone?.y).toBe(200);
    expect(clone?.cell).toBe(42);
    expect(clone?.dx).toBe(1);
    expect(clone?.dy).toBe(2);
    expect(clone?.px).toBe(3);
    expect(clone?.size).toBe(16);
    expect(clone?.pin).toBe("bubble");
    expect(clone?.fill).toBe("#fff");
    expect(clone?.stroke).toBe("#000");
    expect(clone?.pinned).toBe(true);
    expect(clone?.removed).toBe(false);
    expect(clone?.lock).toBe(true);
  });

  it("addLines not provided → no error", async () => {
    const markers: RawMarker[] = [{ i: 1 }];
    const { runtime } = makeRuntime({ markers });
    expect(runtime.addLines).toBeUndefined();
    const tool = createInvertMarkerLocksTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
  });

  it("addLines throws → swallowed; result ok; reassignment still happened", async () => {
    const markers: RawMarker[] = [{ i: 1 }];
    const { runtime, getStored } = makeRuntime({
      markers,
      addLines: () => {
        throw new Error("ui!");
      },
    });
    const tool = createInvertMarkerLocksTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(getStored()?.[0].lock).toBe(true);
  });

  it("empty markers array → all zeros, still reassigns to a NEW empty array (LOAD-BEARING)", async () => {
    const markers: RawMarker[] = [];
    const before = markers;
    const { runtime, setMarkers, getStored } = makeRuntime({ markers });
    const tool = createInvertMarkerLocksTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 0,
      now_locked: 0,
      now_unlocked: 0,
    });
    expect(setMarkers.mock.calls.length).toBe(1);
    expect(getStored()).not.toBe(before);
    expect(getStored()?.length).toBe(0);
  });

  it("missing pack.markers → exact error; setMarkers and addLines NOT called", async () => {
    const { runtime, setMarkers, addLines } = makeRuntime({
      markers: undefined,
      addLines: () => {},
    });
    const tool = createInvertMarkerLocksTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.markers is not available; the map hasn't finished loading.",
    );
    expect(setMarkers.mock.calls.length).toBe(0);
    expect(addLines?.mock.calls.length).toBe(0);
  });

  it("non-array pack.markers → same error", async () => {
    const { runtime } = makeRuntime({
      markers: "oops" as unknown as RawMarker[],
    });
    const tool = createInvertMarkerLocksTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.markers is not available; the map hasn't finished loading.",
    );
  });

  it("getMarkers() throws → error propagated; setMarkers not called", async () => {
    const { runtime, setMarkers } = makeRuntime({
      getMarkersThrows: new Error("boom"),
    });
    const tool = createInvertMarkerLocksTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/boom/);
    expect(setMarkers.mock.calls.length).toBe(0);
  });

  it("setMarkers() throws → error propagated", async () => {
    const { runtime } = makeRuntime({
      markers: [{ i: 1 }] as RawMarker[],
      setMarkersThrows: new Error("setfail"),
    });
    const tool = createInvertMarkerLocksTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/setfail/);
  });

  it("tool name + schema + registry round-trip", () => {
    expect(invertMarkerLocksTool.name).toBe("invert_marker_locks");
    expect(invertMarkerLocksTool.input_schema).toEqual({
      type: "object",
      properties: {},
    });
    const reg = new ToolRegistry();
    reg.register(invertMarkerLocksTool);
    expect(reg.list().map((t) => t.name)).toContain("invert_marker_locks");
  });

  it("ignores extraneous input properties", async () => {
    const markers: RawMarker[] = [{ i: 1 }];
    const { runtime } = makeRuntime({ markers });
    const tool = createInvertMarkerLocksTool(runtime);
    const result = await tool.execute({ bogus: "x", count: 7 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 1,
      now_locked: 1,
      now_unlocked: 0,
    });
  });

  it("tolerates null/undefined input", async () => {
    const markers1: RawMarker[] = [{ i: 1 }];
    const r1 = makeRuntime({ markers: markers1 });
    const tool1 = createInvertMarkerLocksTool(r1.runtime);
    const res1 = await tool1.execute(null);
    expect(res1.isError).toBeFalsy();

    const markers2: RawMarker[] = [{ i: 1 }];
    const r2 = makeRuntime({ markers: markers2 });
    const tool2 = createInvertMarkerLocksTool(r2.runtime);
    const res2 = await tool2.execute(undefined);
    expect(res2.isError).toBeFalsy();
  });
});

describe("defaultInvertMarkerLocksRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalAdd = (globalThis as { addLines?: unknown }).addLines;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = undefined;
    (globalThis as { addLines?: unknown }).addLines = undefined;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { addLines?: unknown }).addLines = originalAdd;
  });

  it("end-to-end: 3 markers (true, false, undefined) → REASSIGNMENT, addLines once, originals unchanged (LOAD-BEARING)", async () => {
    const markers: RawMarker[] = [
      { i: 1, lock: true },
      { i: 2, lock: false },
      { i: 3 },
    ];
    (globalThis as { pack?: unknown }).pack = { markers };
    const lines = vi.fn();
    (globalThis as { addLines?: unknown }).addLines = lines;
    const before = markers;

    const result = await invertMarkerLocksTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 3,
      now_locked: 2,
      now_unlocked: 1,
    });
    const livePack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(livePack.markers).not.toBe(before);
    expect(livePack.markers[0].lock).toBe(false);
    expect(livePack.markers[1].lock).toBe(true);
    expect(livePack.markers[2].lock).toBe(true);
    // Originals untouched.
    expect(before[0].lock).toBe(true);
    expect(before[1].lock).toBe(false);
    expect("lock" in before[2]).toBe(false);
    expect(lines).toHaveBeenCalledTimes(1);
  });

  it("integration: empty markers array → reassigns to a fresh empty array", async () => {
    (globalThis as { pack?: unknown }).pack = { markers: [] as RawMarker[] };
    const livePackBefore = (globalThis as { pack: { markers: RawMarker[] } })
      .pack;
    const before = livePackBefore.markers;

    const result = await invertMarkerLocksTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 0,
      now_locked: 0,
      now_unlocked: 0,
    });
    const livePack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(livePack.markers).not.toBe(before);
    expect(livePack.markers.length).toBe(0);
  });

  it("integration: missing pack → exact error, no addLines call", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const lines = vi.fn();
    (globalThis as { addLines?: unknown }).addLines = lines;

    const result = await invertMarkerLocksTool.execute({});

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.pack\.markers is not available/,
    );
    expect(lines).not.toHaveBeenCalled();
  });

  it("integration: pack.markers not an array → same error", async () => {
    (globalThis as { pack?: unknown }).pack = { markers: "nope" };

    const result = await invertMarkerLocksTool.execute({});

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.pack\.markers is not available/,
    );
  });

  it("integration: addLines global missing → no error, mutation applied", async () => {
    (globalThis as { pack?: unknown }).pack = {
      markers: [{ i: 1 }] as RawMarker[],
    };
    (globalThis as { addLines?: unknown }).addLines = undefined;

    const result = await invertMarkerLocksTool.execute({});

    expect(result.isError).toBeFalsy();
    const livePack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(livePack.markers[0].lock).toBe(true);
  });
});
