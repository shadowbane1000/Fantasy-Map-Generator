import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeFitScale,
  createFocusOnEntityTool,
  DEFAULT_FOCUS_PADDING,
  defaultFocusOnEntityRuntime,
  FALLBACK_VIEWPORT_SIZE,
  type FocusOnEntityRuntime,
  focusOnEntityTool,
  MAX_FOCUS_PADDING,
  MIN_FIT_SCALE,
  type Viewport,
} from "./focus-on-entity";
import { FOCUS_ZOOM_DURATION, FOCUS_ZOOM_LEVEL } from "./focus-on-map";
import {
  type CollectEntityBboxResult,
  collectEntityBbox,
} from "./get-entity-bbox";

interface FakeEntity {
  i: number;
  name?: string;
  fullName?: string;
  removed?: boolean;
}

interface FakePack {
  cells: {
    i: number[];
    p: [number, number][];
    state: number[];
    province: number[];
    culture: number[];
    religion: number[];
    biome: number[];
  };
  states: FakeEntity[];
  provinces: FakeEntity[];
  cultures: FakeEntity[];
  religions: FakeEntity[];
}

interface FakeBiomesData {
  i: number[];
  name: string[];
}

// Cell layout (same as get-entity-bbox tests):
//   cell:   0       1       2       3       4       5       6       7
//   p:      (0,0)   (10,0)  (20,0)  (0,10)  (10,10) (20,10) (0,20)  (10,20)
const FAKE_POINTS: [number, number][] = [
  [0, 0],
  [10, 0],
  [20, 0],
  [0, 10],
  [10, 10],
  [20, 10],
  [0, 20],
  [10, 20],
];

function makePack(): FakePack {
  return {
    cells: {
      i: [0, 1, 2, 3, 4, 5, 6, 7],
      p: FAKE_POINTS.map((p) => [...p] as [number, number]),
      // state 3 cells: 1,2,3,7 → p: (10,0),(20,0),(0,10),(10,20) → bbox (0,0)-(20,20) cx=10 cy=10
      state: [0, 3, 3, 3, 5, 5, 0, 3],
      // province 4 cells: 1,2,4 → bbox (10,0)-(20,10) cx=15 cy=5
      province: [0, 4, 4, 2, 4, 2, 0, 2],
      culture: [0, 2, 7, 2, 2, 7, 0, 2],
      religion: [0, 5, 5, 1, 5, 1, 1, 5],
      biome: [1, 1, 2, 3, 2, 3, 2, 1],
    },
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Ghostland", removed: true },
      undefined as unknown as FakeEntity,
      { i: 3, name: "Altaria", fullName: "Kingdom of Altaria" },
      undefined as unknown as FakeEntity,
      { i: 5, name: "Brumaria" },
    ],
    provinces: [
      { i: 0, name: "Placeholder" },
      undefined as unknown as FakeEntity,
      { i: 2, name: "Rookmark" },
      undefined as unknown as FakeEntity,
      { i: 4, name: "Stormreach" },
    ],
    cultures: [
      { i: 0, name: "Wildlands" },
      undefined as unknown as FakeEntity,
      { i: 2, name: "Highlanders" },
      undefined as unknown as FakeEntity,
      undefined as unknown as FakeEntity,
      undefined as unknown as FakeEntity,
      undefined as unknown as FakeEntity,
      { i: 7, name: "Marshfolk" },
    ],
    religions: [
      { i: 0, name: "No religion" },
      { i: 1, name: "Old Faith" },
      undefined as unknown as FakeEntity,
      undefined as unknown as FakeEntity,
      undefined as unknown as FakeEntity,
      { i: 5, name: "Stormcult" },
    ],
  };
}

function makeBiomesData(): FakeBiomesData {
  return {
    i: [0, 1, 2, 3, 4],
    name: ["Marine", "Grassland", "Forest", "Desert", "removed"],
  };
}

function makeRuntime(overrides: Partial<FocusOnEntityRuntime> = {}) {
  const pack = makePack() as unknown as Parameters<typeof collectEntityBbox>[0];
  const biomes = makeBiomesData() as unknown as Parameters<
    typeof collectEntityBbox
  >[1];
  const collect = vi.fn<FocusOnEntityRuntime["collect"]>((type, ref) =>
    collectEntityBbox(pack, biomes, type, ref),
  );
  const zoomTo = vi.fn<FocusOnEntityRuntime["zoomTo"]>();
  const getViewport = vi.fn<FocusOnEntityRuntime["getViewport"]>(
    () => ({ width: 1000, height: 1000 }) as Viewport,
  );
  const runtime: FocusOnEntityRuntime = {
    collect,
    zoomTo,
    getViewport,
    ...overrides,
  };
  return { runtime, collect, zoomTo, getViewport };
}

function runtimeReturning(
  result: CollectEntityBboxResult,
): FocusOnEntityRuntime {
  return {
    collect: () => result,
    getViewport: () => ({ width: 1000, height: 1000 }),
    zoomTo: () => {},
  };
}

describe("computeFitScale", () => {
  it("clamps to maxScale when the viewport is much larger than the bbox", () => {
    expect(computeFitScale(10, 10, 1000, 1000, 0, 8)).toBe(8);
  });

  it("matches the width ratio when width is the limiting dimension", () => {
    // bbox 200 wide, 10 tall, viewport 400x1000 → sx=2, sy=100 → 2
    expect(computeFitScale(200, 10, 400, 1000, 0, 8)).toBeCloseTo(2);
  });

  it("matches the height ratio when height is the limiting dimension", () => {
    // bbox 10 wide, 200 tall, viewport 1000x400 → sx=100, sy=2 → 2
    expect(computeFitScale(10, 200, 1000, 400, 0, 8)).toBeCloseTo(2);
  });

  it("returns maxScale for a zero-size bbox with no padding", () => {
    expect(computeFitScale(0, 0, 1000, 1000, 0, 8)).toBe(8);
  });

  it("inflates the effective bbox by 2*padding", () => {
    // bbox 0x0 with padding 50 → effective 100x100 into 1000x1000 → 10, clamped to 8
    expect(computeFitScale(0, 0, 1000, 1000, 50, 8)).toBe(8);
    // bbox 900x900 with padding 50 → 1000x1000 into 1000x1000 → 1
    expect(computeFitScale(900, 900, 1000, 1000, 50, 8)).toBe(1);
  });

  it("floors the scale at MIN_FIT_SCALE (1)", () => {
    // bbox 2000x2000 into 200x200 → would be 0.1, floored to 1
    expect(computeFitScale(2000, 2000, 200, 200, 0, 8)).toBe(MIN_FIT_SCALE);
  });

  it("uses maxScale when one dimension is zero and the other has room", () => {
    // bbox 0x100, viewport 1000x1000, no padding → sx=inf, sy=10 → clamp to 8
    expect(computeFitScale(0, 100, 1000, 1000, 0, 8)).toBe(8);
  });
});

describe("focus_on_entity — tool surface", () => {
  it("returns ok=true with resolved entity, bbox, padding", async () => {
    const { runtime, zoomTo } = makeRuntime();
    const tool = createFocusOnEntityTool(runtime);
    const result = await tool.execute({ entity_type: "state", entity: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      entity_type: "state",
      i: 3,
      name: "Altaria",
      bbox: {
        x_min: 0,
        y_min: 0,
        x_max: 20,
        y_max: 20,
        width: 20,
        height: 20,
        cx: 10,
        cy: 10,
      },
      padding: DEFAULT_FOCUS_PADDING,
    });
    expect(zoomTo).toHaveBeenCalledTimes(1);
  });

  it("calls zoomTo with cx, cy, the fit scale, and FOCUS_ZOOM_DURATION", async () => {
    const { runtime, zoomTo } = makeRuntime();
    const tool = createFocusOnEntityTool(runtime);
    // state 3 bbox 20x20, centroid (10,10), viewport 1000x1000, padding 50
    // effective bbox 120x120 → scale 1000/120 = 8.33, clamped to 8
    await tool.execute({ entity_type: "state", entity: 3 });
    expect(zoomTo).toHaveBeenCalledWith(
      10,
      10,
      FOCUS_ZOOM_LEVEL,
      FOCUS_ZOOM_DURATION,
    );
  });

  it("computes a smaller scale when the bbox is comparable to the viewport", async () => {
    const { runtime, zoomTo } = makeRuntime({
      getViewport: () => ({ width: 100, height: 100 }),
    });
    const tool = createFocusOnEntityTool(runtime);
    // state 3 bbox 20x20, viewport 100x100, padding 0
    // effective 20x20 into 100x100 → scale 5
    await tool.execute({ entity_type: "state", entity: 3, padding: 0 });
    expect(zoomTo).toHaveBeenCalledWith(10, 10, 5, FOCUS_ZOOM_DURATION);
  });

  it("accepts padding === 0 and uses it", async () => {
    const { runtime, zoomTo } = makeRuntime();
    const tool = createFocusOnEntityTool(runtime);
    const result = await tool.execute({
      entity_type: "province",
      entity: "Stormreach",
      padding: 0,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).padding).toBe(0);
    expect(zoomTo).toHaveBeenCalled();
  });

  it("accepts custom padding", async () => {
    const { runtime, zoomTo } = makeRuntime();
    const tool = createFocusOnEntityTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 3,
      padding: 200,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).padding).toBe(200);
    // viewport 1000, bbox 20 wide, effective width 420 → scale 1000/420 ≈ 2.38
    const call = zoomTo.mock.calls[0];
    expect(call[0]).toBe(10);
    expect(call[1]).toBe(10);
    expect(call[2]).toBeCloseTo(1000 / 420, 4);
    expect(call[3]).toBe(FOCUS_ZOOM_DURATION);
  });

  it("accepts entity_type case-insensitively", async () => {
    const { runtime } = makeRuntime();
    const tool = createFocusOnEntityTool(runtime);
    for (const input of [
      { entity_type: "STATE", entity: 3 },
      { entity_type: "Province", entity: "Rookmark" },
      { entity_type: "Culture", entity: "Highlanders" },
      { entity_type: "ReLiGion", entity: 1 },
      { entity_type: "Biome", entity: 2 },
    ]) {
      const r = await tool.execute(input);
      expect(r.isError).toBeFalsy();
      expect(JSON.parse(r.content).ok).toBe(true);
    }
  });

  it("accepts entity by numeric id and by name", async () => {
    const { runtime } = makeRuntime();
    const tool = createFocusOnEntityTool(runtime);
    const byId = await tool.execute({ entity_type: "state", entity: 3 });
    const byName = await tool.execute({
      entity_type: "state",
      entity: "altaria",
    });
    expect(byId.isError).toBeFalsy();
    expect(byName.isError).toBeFalsy();
    expect(JSON.parse(byId.content).i).toBe(3);
    expect(JSON.parse(byName.content).i).toBe(3);
  });

  it("uses FOCUS_ZOOM_LEVEL for a single-cell bbox", async () => {
    // Scrub state 3 so it only has cell 4 (p = (10,10)) → bbox 0x0 at (10,10)
    const pack = makePack();
    for (let k = 0; k < pack.cells.state.length; k++) {
      if (pack.cells.state[k] === 3) pack.cells.state[k] = 0;
    }
    pack.cells.state[4] = 3;
    const biomes = makeBiomesData();
    const runtime: FocusOnEntityRuntime = {
      collect: (t, r) =>
        collectEntityBbox(
          pack as unknown as Parameters<typeof collectEntityBbox>[0],
          biomes as unknown as Parameters<typeof collectEntityBbox>[1],
          t,
          r,
        ),
      getViewport: () => ({ width: 1000, height: 1000 }),
      zoomTo: vi.fn<FocusOnEntityRuntime["zoomTo"]>(),
    };
    const tool = createFocusOnEntityTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 3,
      padding: 0,
    });
    expect(result.isError).toBeFalsy();
    expect(runtime.zoomTo).toHaveBeenCalledWith(
      10,
      10,
      FOCUS_ZOOM_LEVEL,
      FOCUS_ZOOM_DURATION,
    );
  });

  it("rejects unknown entity_type (including 'burg')", async () => {
    const { runtime, zoomTo } = makeRuntime();
    const tool = createFocusOnEntityTool(runtime);
    for (const bad of [
      { entity_type: "burg", entity: 1 },
      { entity_type: "", entity: 1 },
      { entity_type: 7, entity: 1 },
      { entity: 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/entity_type must be one of/);
    }
    expect(zoomTo).not.toHaveBeenCalled();
  });

  it("rejects missing / invalid entity (non-biome types)", async () => {
    const { runtime, zoomTo } = makeRuntime();
    const tool = createFocusOnEntityTool(runtime);
    for (const bad of [
      { entity_type: "state" },
      { entity_type: "state", entity: 0 },
      { entity_type: "state", entity: -1 },
      { entity_type: "state", entity: 1.5 },
      { entity_type: "state", entity: "" },
      { entity_type: "state", entity: null },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /entity must be a positive integer id or a non-empty name string/,
      );
    }
    expect(zoomTo).not.toHaveBeenCalled();
  });

  it("accepts biome id 0 but rejects negatives / fractions / empty", async () => {
    const { runtime } = makeRuntime();
    const tool = createFocusOnEntityTool(runtime);
    // biome 0 (Marine) resolves but has no cells → cells_count=0 → error
    const zeroBiome = await tool.execute({ entity_type: "biome", entity: 0 });
    expect(zeroBiome.isError).toBe(true);
    expect(JSON.parse(zeroBiome.content).error).toMatch(/no cells/);

    for (const bad of [
      { entity_type: "biome", entity: -1 },
      { entity_type: "biome", entity: 1.5 },
      { entity_type: "biome", entity: "" },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /entity must be a non-negative integer id or a non-empty name string/,
      );
    }
  });

  it("rejects invalid padding values", async () => {
    const { runtime, zoomTo } = makeRuntime();
    const tool = createFocusOnEntityTool(runtime);
    for (const bad of [
      { entity_type: "state", entity: 3, padding: -1 },
      { entity_type: "state", entity: 3, padding: 1.5 },
      { entity_type: "state", entity: 3, padding: "50" },
      { entity_type: "state", entity: 3, padding: MAX_FOCUS_PADDING + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/padding must be an integer/);
    }
    expect(zoomTo).not.toHaveBeenCalled();
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFocusOnEntityTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ entity_type: "state", entity: 1 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'unknown-entity' as a structured error", async () => {
    const tool = createFocusOnEntityTool(runtimeReturning("unknown-entity"));
    const r = await tool.execute({
      entity_type: "culture",
      entity: "Nowhere",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(
      /Could not resolve culture "Nowhere"\./,
    );
  });

  it("surfaces an empty-cells entity as a structured error", async () => {
    const tool = createFocusOnEntityTool(
      runtimeReturning({
        i: 4,
        name: "Empty",
        bbox: {
          x_min: null,
          y_min: null,
          x_max: null,
          y_max: null,
          width: null,
          height: null,
          cx: null,
          cy: null,
        },
        cells_count: 0,
      }),
    );
    const r = await tool.execute({ entity_type: "province", entity: 4 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/no cells/);
  });

  it("surfaces runtime zoomTo throw", async () => {
    const { runtime } = makeRuntime({
      zoomTo: vi.fn<FocusOnEntityRuntime["zoomTo"]>(() => {
        throw new Error("zoomTo is not available.");
      }),
    });
    const tool = createFocusOnEntityTool(runtime);
    const r = await tool.execute({ entity_type: "state", entity: 3 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not available/);
  });

  it("is exported as focusOnEntityTool with the expected schema", () => {
    expect(focusOnEntityTool.name).toBe("focus_on_entity");
    expect(focusOnEntityTool.input_schema.type).toBe("object");
    expect(focusOnEntityTool.input_schema.required).toEqual([
      "entity_type",
      "entity",
    ]);
    expect(focusOnEntityTool.input_schema.properties.entity_type).toBeDefined();
    expect(focusOnEntityTool.input_schema.properties.entity).toBeDefined();
    expect(focusOnEntityTool.input_schema.properties.padding).toBeDefined();
  });
});

// ----- defaultFocusOnEntityRuntime integration -----

describe("defaultFocusOnEntityRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    biomesData?: unknown;
    zoomTo?: unknown;
    svgWidth?: unknown;
    svgHeight?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalBiomes = globalsRef.biomesData;
  const originalZoomTo = globalsRef.zoomTo;
  const originalSvgWidth = globalsRef.svgWidth;
  const originalSvgHeight = globalsRef.svgHeight;

  const zoomCalls: [number, number, number, number][] = [];

  beforeEach(() => {
    zoomCalls.length = 0;
    globalsRef.pack = makePack() as unknown;
    globalsRef.biomesData = makeBiomesData() as unknown;
    globalsRef.svgWidth = 1000 as unknown;
    globalsRef.svgHeight = 1000 as unknown;
    globalsRef.zoomTo = ((x: number, y: number, z: number, d: number) => {
      zoomCalls.push([x, y, z, d]);
    }) as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.biomesData = originalBiomes;
    globalsRef.zoomTo = originalZoomTo;
    globalsRef.svgWidth = originalSvgWidth;
    globalsRef.svgHeight = originalSvgHeight;
  });

  it("reads pack / biomesData / svgWidth / svgHeight via the default runtime", () => {
    const result = defaultFocusOnEntityRuntime.collect("state", 3);
    expect(result).toMatchObject({
      i: 3,
      name: "Altaria",
      bbox: { x_min: 0, y_min: 0, x_max: 20, y_max: 20 },
      cells_count: 4,
    });
    const viewport = defaultFocusOnEntityRuntime.getViewport();
    expect(viewport).toEqual({ width: 1000, height: 1000 });
  });

  it("tool uses default runtime to resolve, fit, and call zoomTo", async () => {
    const result = await focusOnEntityTool.execute({
      entity_type: "religion",
      entity: "Stormcult",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      entity_type: "religion",
      i: 5,
      name: "Stormcult",
      padding: DEFAULT_FOCUS_PADDING,
    });
    // religion 5 bbox 10x20 cx=15 cy=10; viewport 1000x1000 pad 50
    // effective width 110, height 120 → scale 1000/120 ≈ 8.33 → clamp to 8
    expect(zoomCalls).toHaveLength(1);
    expect(zoomCalls[0][0]).toBe(15);
    expect(zoomCalls[0][1]).toBe(10);
    expect(zoomCalls[0][2]).toBe(FOCUS_ZOOM_LEVEL);
    expect(zoomCalls[0][3]).toBe(FOCUS_ZOOM_DURATION);
  });

  it("surfaces missing zoomTo as an error", async () => {
    globalsRef.zoomTo = undefined;
    const result = await focusOnEntityTool.execute({
      entity_type: "state",
      entity: 3,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
  });

  it("falls back to FALLBACK_VIEWPORT_SIZE when svgWidth / svgHeight are missing", () => {
    globalsRef.svgWidth = undefined;
    globalsRef.svgHeight = undefined;
    expect(defaultFocusOnEntityRuntime.getViewport()).toEqual({
      width: FALLBACK_VIEWPORT_SIZE,
      height: FALLBACK_VIEWPORT_SIZE,
    });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFocusOnEntityRuntime.collect("state", 3)).toBe("not-ready");
    const result = await focusOnEntityTool.execute({
      entity_type: "state",
      entity: 3,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
