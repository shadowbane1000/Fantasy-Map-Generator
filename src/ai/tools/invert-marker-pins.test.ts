import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMarker } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createInvertMarkerPinsTool,
  type InvertMarkerPinsRuntime,
  invertMarkerPinsTool,
} from "./invert-marker-pins";

interface MakeRuntimeOpts {
  markers?: RawMarker[] | undefined | unknown;
  drawMarkers?: () => void;
  addLines?: () => void;
  setMarkerGroupPinned?: (v: 1 | null) => void;
  getMarkersThrows?: Error;
}

function makeRuntime(opts: MakeRuntimeOpts = {}) {
  const setMarkerGroupPinned = vi.fn(opts.setMarkerGroupPinned ?? (() => {}));
  const drawMarkers = opts.drawMarkers ? vi.fn(opts.drawMarkers) : undefined;
  const addLines = opts.addLines ? vi.fn(opts.addLines) : undefined;
  const getMarkers = vi.fn(() => {
    if (opts.getMarkersThrows) throw opts.getMarkersThrows;
    return opts.markers as RawMarker[] | undefined;
  });
  const runtime: InvertMarkerPinsRuntime = {
    getMarkers,
    setMarkerGroupPinned,
    drawMarkers,
    addLines,
  };
  return {
    runtime,
    getMarkers,
    setMarkerGroupPinned,
    drawMarkers,
    addLines,
  };
}

describe("invert_marker_pins tool", () => {
  it("happy path (mixed): 2 pinned + 1 unpinned → 1 pinned + 2 unpinned, delete semantics", async () => {
    const markers: RawMarker[] = [
      { i: 1, pinned: true },
      { i: 2 },
      { i: 3, pinned: true },
    ];
    const { runtime, setMarkerGroupPinned } = makeRuntime({ markers });
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 3,
      now_pinned: 1,
      now_unpinned: 2,
      any_pinned: true,
    });
    // Load-bearing: delete-not-assignment semantics.
    expect("pinned" in markers[0]).toBe(false);
    expect(markers[1].pinned).toBe(true);
    expect("pinned" in markers[2]).toBe(false);
    expect(setMarkerGroupPinned).toHaveBeenCalledTimes(1);
    expect(setMarkerGroupPinned.mock.calls[0][0]).toBe(1);
  });

  it("all unpinned → all pinned", async () => {
    const markers: RawMarker[] = [{ i: 1 }, { i: 2 }, { i: 3 }];
    const { runtime, setMarkerGroupPinned } = makeRuntime({ markers });
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 3,
      now_pinned: 3,
      now_unpinned: 0,
      any_pinned: true,
    });
    for (const marker of markers) {
      expect(marker.pinned).toBe(true);
    }
    expect(setMarkerGroupPinned).toHaveBeenCalledTimes(1);
    expect(setMarkerGroupPinned.mock.calls[0][0]).toBe(1);
  });

  it("all pinned → all unpinned, delete semantics for every marker (LOAD-BEARING)", async () => {
    const markers: RawMarker[] = [
      { i: 1, pinned: true },
      { i: 2, pinned: true },
      { i: 3, pinned: true },
    ];
    const { runtime, setMarkerGroupPinned } = makeRuntime({ markers });
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 3,
      now_pinned: 0,
      now_unpinned: 3,
      any_pinned: false,
    });
    for (const marker of markers) {
      expect("pinned" in marker).toBe(false);
    }
    expect(setMarkerGroupPinned).toHaveBeenCalledTimes(1);
    expect(setMarkerGroupPinned.mock.calls[0][0]).toBeNull();
  });

  it("empty markers array → all zeros", async () => {
    const markers: RawMarker[] = [];
    const { runtime, setMarkerGroupPinned } = makeRuntime({ markers });
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 0,
      now_pinned: 0,
      now_unpinned: 0,
      any_pinned: false,
    });
    expect(setMarkerGroupPinned).toHaveBeenCalledTimes(1);
    expect(setMarkerGroupPinned.mock.calls[0][0]).toBeNull();
  });

  it("missing pack.markers → exact error", async () => {
    const { runtime, setMarkerGroupPinned } = makeRuntime({
      markers: undefined,
    });
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.markers is not available; the map hasn't finished loading.",
    );
    expect(setMarkerGroupPinned).not.toHaveBeenCalled();
  });

  it("non-array pack.markers → same error", async () => {
    const { runtime } = makeRuntime({
      markers: "oops" as unknown as RawMarker[],
    });
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.markers is not available; the map hasn't finished loading.",
    );
  });

  it("getMarkers() throws → error propagated", async () => {
    const { runtime } = makeRuntime({ getMarkersThrows: new Error("boom") });
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/boom/);
  });

  it("setMarkerGroupPinned called with 1 when any pinned (LOAD-BEARING)", async () => {
    const markers: RawMarker[] = [{ i: 1 }];
    const { runtime, setMarkerGroupPinned } = makeRuntime({ markers });
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(setMarkerGroupPinned.mock.calls[0]).toEqual([1]);
  });

  it("setMarkerGroupPinned called with null when none pinned (LOAD-BEARING)", async () => {
    const markers: RawMarker[] = [{ i: 1, pinned: true }];
    const { runtime, setMarkerGroupPinned } = makeRuntime({ markers });
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(setMarkerGroupPinned.mock.calls[0]).toEqual([null]);
  });

  it("drawMarkers not provided → no error", async () => {
    const markers: RawMarker[] = [{ i: 1 }];
    const { runtime } = makeRuntime({ markers });
    expect(runtime.drawMarkers).toBeUndefined();
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
  });

  it("addLines not provided → no error", async () => {
    const markers: RawMarker[] = [{ i: 1 }];
    const { runtime } = makeRuntime({ markers });
    expect(runtime.addLines).toBeUndefined();
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
  });

  it("drawMarkers throws → swallowed; result ok; mutation applied", async () => {
    const markers: RawMarker[] = [{ i: 1 }];
    const { runtime, setMarkerGroupPinned } = makeRuntime({
      markers,
      drawMarkers: () => {
        throw new Error("svg!");
      },
    });
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(markers[0].pinned).toBe(true);
    expect(setMarkerGroupPinned.mock.calls[0]).toEqual([1]);
  });

  it("addLines throws → swallowed; result ok", async () => {
    const markers: RawMarker[] = [{ i: 1 }];
    const { runtime } = makeRuntime({
      markers,
      addLines: () => {
        throw new Error("svg!");
      },
    });
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(markers[0].pinned).toBe(true);
  });

  it("setMarkerGroupPinned throws → swallowed; result ok", async () => {
    const markers: RawMarker[] = [{ i: 1 }];
    const { runtime } = makeRuntime({
      markers,
      setMarkerGroupPinned: () => {
        throw new Error("dom!");
      },
    });
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(markers[0].pinned).toBe(true);
  });

  it("in-place mutation — pack.markers identity preserved (LOAD-BEARING)", async () => {
    const markers: RawMarker[] = [{ i: 1, pinned: true }, { i: 2 }];
    const before = markers;
    const { runtime, getMarkers } = makeRuntime({ markers });
    const tool = createInvertMarkerPinsTool(runtime);
    await tool.execute({});
    expect(markers).toBe(before);
    expect(getMarkers.mock.results[0]?.value).toBe(before);
  });

  it.each([
    {
      label: "mixed",
      markers: [
        { i: 1, pinned: true },
        { i: 2 },
        { i: 3, pinned: true },
      ] as RawMarker[],
      expectedPinned: 1,
      expectedAny: true,
    },
    {
      label: "all unpinned",
      markers: [{ i: 1 }, { i: 2 }, { i: 3 }] as RawMarker[],
      expectedPinned: 3,
      expectedAny: true,
    },
    {
      label: "all pinned",
      markers: [
        { i: 1, pinned: true },
        { i: 2, pinned: true },
      ] as RawMarker[],
      expectedPinned: 0,
      expectedAny: false,
    },
    {
      label: "empty",
      markers: [] as RawMarker[],
      expectedPinned: 0,
      expectedAny: false,
    },
  ])("any_pinned reflects (now_pinned > 0) for $label", async ({
    markers,
    expectedPinned,
    expectedAny,
  }) => {
    const { runtime } = makeRuntime({ markers });
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.now_pinned).toBe(expectedPinned);
    expect(body.any_pinned).toBe(expectedAny);
    expect(body.any_pinned).toBe(body.now_pinned > 0);
  });

  it("tool name + schema + registry round-trip", () => {
    expect(invertMarkerPinsTool.name).toBe("invert_marker_pins");
    expect(invertMarkerPinsTool.input_schema).toEqual({
      type: "object",
      properties: {},
    });
    const reg = new ToolRegistry();
    reg.register(invertMarkerPinsTool);
    expect(reg.list().map((t) => t.name)).toContain("invert_marker_pins");
  });

  it("ignores extraneous input properties", async () => {
    const markers: RawMarker[] = [{ i: 1 }];
    const { runtime } = makeRuntime({ markers });
    const tool = createInvertMarkerPinsTool(runtime);
    const result = await tool.execute({ bogus: "x", count: 7 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total).toBe(1);
  });

  it("tolerates null/undefined input", async () => {
    const markers: RawMarker[] = [{ i: 1 }];
    const { runtime } = makeRuntime({ markers });
    const tool = createInvertMarkerPinsTool(runtime);
    const r1 = await tool.execute(null);
    expect(r1.isError).toBeFalsy();
    // Re-init markers since the previous call mutated them.
    markers.length = 0;
    markers.push({ i: 1 });
    const r2 = await tool.execute(undefined);
    expect(r2.isError).toBeFalsy();
  });
});

interface FakeMarkerGroup {
  setAttribute: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
}

function installMarkerGroup(): {
  markerGroup: FakeMarkerGroup;
  setAttribute: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
} {
  const setAttribute = vi.fn();
  const removeAttribute = vi.fn();
  const markerGroup: FakeMarkerGroup = { setAttribute, removeAttribute };
  (globalThis as { document?: unknown }).document = {
    getElementById(id: string) {
      return id === "markers" ? markerGroup : null;
    },
  };
  return { markerGroup, setAttribute, removeAttribute };
}

describe("defaultInvertMarkerPinsRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalDraw = (globalThis as { drawMarkers?: unknown }).drawMarkers;
  const originalAdd = (globalThis as { addLines?: unknown }).addLines;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = undefined;
    (globalThis as { document?: unknown }).document = undefined;
    (globalThis as { drawMarkers?: unknown }).drawMarkers = undefined;
    (globalThis as { addLines?: unknown }).addLines = undefined;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { drawMarkers?: unknown }).drawMarkers = originalDraw;
    (globalThis as { addLines?: unknown }).addLines = originalAdd;
  });

  it("end-to-end: 2 pinned + 1 unpinned → mutation, attr '1', drawMarkers + addLines called once each", async () => {
    const markers: RawMarker[] = [
      { i: 1, pinned: true },
      { i: 2 },
      { i: 3, pinned: true },
    ];
    (globalThis as { pack?: unknown }).pack = { markers };
    const { setAttribute, removeAttribute } = installMarkerGroup();
    const draw = vi.fn();
    const lines = vi.fn();
    (globalThis as { drawMarkers?: unknown }).drawMarkers = draw;
    (globalThis as { addLines?: unknown }).addLines = lines;
    const before = markers;

    const result = await invertMarkerPinsTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 3,
      now_pinned: 1,
      now_unpinned: 2,
      any_pinned: true,
    });
    const livePack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(livePack.markers).toBe(before);
    expect("pinned" in livePack.markers[0]).toBe(false);
    expect(livePack.markers[1].pinned).toBe(true);
    expect("pinned" in livePack.markers[2]).toBe(false);
    expect(setAttribute).toHaveBeenCalledTimes(1);
    expect(setAttribute).toHaveBeenCalledWith("pinned", "1");
    expect(removeAttribute).not.toHaveBeenCalled();
    expect(draw).toHaveBeenCalledTimes(1);
    expect(lines).toHaveBeenCalledTimes(1);
  });

  it('integration: all unpinned → setAttribute("pinned", "1")', async () => {
    const markers: RawMarker[] = [{ i: 1 }, { i: 2 }];
    (globalThis as { pack?: unknown }).pack = { markers };
    const { setAttribute, removeAttribute } = installMarkerGroup();

    const result = await invertMarkerPinsTool.execute({});

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.now_pinned).toBe(2);
    expect(body.now_unpinned).toBe(0);
    expect(body.any_pinned).toBe(true);
    expect(setAttribute).toHaveBeenCalledTimes(1);
    expect(setAttribute).toHaveBeenCalledWith("pinned", "1");
    expect(removeAttribute).not.toHaveBeenCalled();
  });

  it("integration: all pinned → removeAttribute, every marker delete (LOAD-BEARING)", async () => {
    const markers: RawMarker[] = [
      { i: 1, pinned: true },
      { i: 2, pinned: true },
    ];
    (globalThis as { pack?: unknown }).pack = { markers };
    const { setAttribute, removeAttribute } = installMarkerGroup();

    const result = await invertMarkerPinsTool.execute({});

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.now_pinned).toBe(0);
    expect(body.now_unpinned).toBe(2);
    expect(body.any_pinned).toBe(false);
    expect(removeAttribute).toHaveBeenCalledTimes(1);
    expect(removeAttribute).toHaveBeenCalledWith("pinned");
    expect(setAttribute).not.toHaveBeenCalled();
    for (const marker of markers) {
      expect("pinned" in marker).toBe(false);
    }
  });

  it("integration: empty markers array → removeAttribute called", async () => {
    (globalThis as { pack?: unknown }).pack = { markers: [] as RawMarker[] };
    const { setAttribute, removeAttribute } = installMarkerGroup();

    const result = await invertMarkerPinsTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 0,
      now_pinned: 0,
      now_unpinned: 0,
      any_pinned: false,
    });
    expect(removeAttribute).toHaveBeenCalledTimes(1);
    expect(setAttribute).not.toHaveBeenCalled();
  });

  it("integration: missing pack → exact error, no mutation, no draw", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const { setAttribute, removeAttribute } = installMarkerGroup();
    const draw = vi.fn();
    const lines = vi.fn();
    (globalThis as { drawMarkers?: unknown }).drawMarkers = draw;
    (globalThis as { addLines?: unknown }).addLines = lines;

    const result = await invertMarkerPinsTool.execute({});

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.pack\.markers is not available/,
    );
    expect(setAttribute).not.toHaveBeenCalled();
    expect(removeAttribute).not.toHaveBeenCalled();
    expect(draw).not.toHaveBeenCalled();
    expect(lines).not.toHaveBeenCalled();
  });

  it("integration: pack.markers not an array → same error", async () => {
    (globalThis as { pack?: unknown }).pack = { markers: "nope" };
    installMarkerGroup();

    const result = await invertMarkerPinsTool.execute({});

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.pack\.markers is not available/,
    );
  });

  it("integration: missing #markers element → no error, mutation still applied", async () => {
    const markers: RawMarker[] = [{ i: 1 }];
    (globalThis as { pack?: unknown }).pack = { markers };
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };

    const result = await invertMarkerPinsTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(markers[0].pinned).toBe(true);
  });

  it("integration: drawMarkers global missing → no error", async () => {
    const markers: RawMarker[] = [{ i: 1 }];
    (globalThis as { pack?: unknown }).pack = { markers };
    installMarkerGroup();
    (globalThis as { drawMarkers?: unknown }).drawMarkers = undefined;

    const result = await invertMarkerPinsTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(markers[0].pinned).toBe(true);
  });

  it("integration: addLines global missing → no error", async () => {
    const markers: RawMarker[] = [{ i: 1 }];
    (globalThis as { pack?: unknown }).pack = { markers };
    installMarkerGroup();
    (globalThis as { addLines?: unknown }).addLines = undefined;

    const result = await invertMarkerPinsTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(markers[0].pinned).toBe(true);
  });

  it("integration: document undefined (SSR-safe) → no error, mutation applied", async () => {
    const markers: RawMarker[] = [{ i: 1 }];
    (globalThis as { pack?: unknown }).pack = { markers };
    (globalThis as { document?: unknown }).document = undefined;

    const result = await invertMarkerPinsTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(markers[0].pinned).toBe(true);
  });
});
