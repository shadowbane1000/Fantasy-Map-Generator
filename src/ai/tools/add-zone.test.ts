import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawZone } from "./_shared";
import {
  type AddZoneInput,
  type AddZoneRuntime,
  addZoneTool,
  createAddZoneTool,
  type NewZone,
  type ValidateCellsResult,
} from "./add-zone";

function makeRuntime(
  overrides: {
    validateCells?: (cells: number[]) => ValidateCellsResult;
    add?: (input: AddZoneInput) => NewZone;
  } = {},
): {
  runtime: AddZoneRuntime;
  validateCells: ReturnType<typeof vi.fn<AddZoneRuntime["validateCells"]>>;
  add: ReturnType<typeof vi.fn<AddZoneRuntime["add"]>>;
} {
  const validateCells = vi.fn<AddZoneRuntime["validateCells"]>(
    overrides.validateCells ?? (() => ({ ok: true })),
  );
  const add = vi.fn<AddZoneRuntime["add"]>(
    overrides.add ??
      ((input) => ({
        i: 7,
        name: input.name,
        type: input.type,
        color: input.color ?? "url(#hatch7)",
        cells: input.cells ?? [],
      })),
  );
  return { runtime: { validateCells, add }, validateCells, add };
}

describe("add_zone tool", () => {
  it("minimal call delegates with defaults and returns new zone", async () => {
    const { runtime, add, validateCells } = makeRuntime();
    const tool = createAddZoneTool(runtime);
    const result = await tool.execute({
      name: "Plague Outbreak",
      type: "Disease",
    });
    expect(result.isError).toBeFalsy();
    expect(validateCells).toHaveBeenCalledWith([]);
    expect(add).toHaveBeenCalledWith({
      name: "Plague Outbreak",
      type: "Disease",
      color: undefined,
      cells: [],
    });
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      i: 7,
      name: "Plague Outbreak",
      type: "Disease",
      color: "url(#hatch7)",
      cells: [],
    });
  });

  it("accepts full inputs and trims strings", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddZoneTool(runtime);
    await tool.execute({
      name: "  Black Death  ",
      type: "  Disease  ",
      color: "  #ff0000  ",
      cells: [1, 2, 3],
    });
    expect(add).toHaveBeenCalledWith({
      name: "Black Death",
      type: "Disease",
      color: "#ff0000",
      cells: [1, 2, 3],
    });
  });

  it("rejects missing / empty name", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddZoneTool(runtime);
    for (const bad of [undefined, null, "", "   ", 42, {}]) {
      const r = await tool.execute({ name: bad, type: "Disease" });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects missing / empty type", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddZoneTool(runtime);
    for (const bad of [undefined, null, "", "   ", 42]) {
      const r = await tool.execute({ name: "Plague", type: bad });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects invalid color", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddZoneTool(runtime);
    for (const bad of ["", "   ", 42, {}]) {
      const r = await tool.execute({
        name: "Plague",
        type: "Disease",
        color: bad,
      });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects invalid cells array", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddZoneTool(runtime);
    const badSets: unknown[] = [
      "not-an-array",
      42,
      [1, "two"],
      [1, -1],
      [1, 2.5],
      [1, null],
    ];
    for (const bad of badSets) {
      const r = await tool.execute({
        name: "Plague",
        type: "Disease",
        cells: bad,
      });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("surfaces validateCells error without calling add", async () => {
    const { runtime, add } = makeRuntime({
      validateCells: () => ({ ok: false, error: "cell 99 out of range" }),
    });
    const tool = createAddZoneTool(runtime);
    const result = await tool.execute({
      name: "Plague",
      type: "Disease",
      cells: [99],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/out of range/);
    expect(add).not.toHaveBeenCalled();
  });

  it("surfaces runtime.add failures", async () => {
    const { runtime } = makeRuntime({
      add: () => {
        throw new Error("pack.zones is not available.");
      },
    });
    const tool = createAddZoneTool(runtime);
    const result = await tool.execute({ name: "Plague", type: "Disease" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.zones/);
  });

  it("omits color from input when not provided (runtime applies default)", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddZoneTool(runtime);
    await tool.execute({ name: "Plague", type: "Disease" });
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ color: undefined }),
    );
  });
});

describe("defaultAddZoneRuntime (integration)", () => {
  const drawMock = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDraw = (globalThis as { drawZones?: unknown }).drawZones;

  beforeEach(() => {
    drawMock.mockReset();
    (globalThis as unknown as { pack?: unknown }).pack = {
      zones: [],
      cells: { i: new Uint32Array(10) },
    };
    (globalThis as unknown as { drawZones?: unknown }).drawZones = drawMock;
  });

  afterEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
    (globalThis as unknown as { drawZones?: unknown }).drawZones = originalDraw;
  });

  it("pushes a minimal zone with i=0, default color, empty cells, and calls drawZones", async () => {
    const result = await addZoneTool.execute({
      name: "Plague Outbreak",
      type: "Disease",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones).toHaveLength(1);
    expect(pack.zones[0]).toEqual({
      i: 0,
      name: "Plague Outbreak",
      type: "Disease",
      color: "url(#hatch0)",
      cells: [],
    });
    expect(drawMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      i: 0,
      name: "Plague Outbreak",
      type: "Disease",
      color: "url(#hatch0)",
      cells: [],
    });
  });

  it("computes i as max(z.i) + 1 when zones already exist", async () => {
    const pack = (globalThis as unknown as { pack: { zones: RawZone[] } }).pack;
    pack.zones.push({ i: 5, name: "Existing", type: "Invasion" });
    await addZoneTool.execute({ name: "New", type: "Disease" });
    expect(pack.zones[1]?.i).toBe(6);
    expect(pack.zones[1]?.color).toBe("url(#hatch6)");
  });

  it("preserves explicit color and cells", async () => {
    await addZoneTool.execute({
      name: "Plague",
      type: "Disease",
      color: "#ff00aa",
      cells: [1, 2, 3],
    });
    const pack = (globalThis as unknown as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones[0]?.color).toBe("#ff00aa");
    expect(pack.zones[0]?.cells).toEqual([1, 2, 3]);
  });

  it("collapses duplicate cells in order", async () => {
    await addZoneTool.execute({
      name: "Plague",
      type: "Disease",
      cells: [3, 1, 3, 2, 1, 3],
    });
    const pack = (globalThis as unknown as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones[0]?.cells).toEqual([3, 1, 2]);
  });

  it("errors when a cell index is out of range and does not push", async () => {
    const result = await addZoneTool.execute({
      name: "Plague",
      type: "Disease",
      cells: [0, 999],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/out of range/);
    const pack = (globalThis as unknown as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones).toHaveLength(0);
    expect(drawMock).not.toHaveBeenCalled();
  });

  it("errors when pack.zones is missing", async () => {
    (globalThis as unknown as { pack?: unknown }).pack = {
      cells: { i: new Uint32Array(10) },
    };
    const result = await addZoneTool.execute({
      name: "Plague",
      type: "Disease",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.zones/);
  });

  it("swallows drawZones errors (data mutation still happens)", async () => {
    drawMock.mockImplementation(() => {
      throw new Error("draw boom");
    });
    const result = await addZoneTool.execute({
      name: "Plague",
      type: "Disease",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones).toHaveLength(1);
  });
});
