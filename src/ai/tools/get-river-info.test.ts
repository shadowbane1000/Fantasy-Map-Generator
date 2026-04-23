import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawRiver } from "./_shared";
import {
  createGetRiverInfoTool,
  defaultRiverInfoRuntime,
  getRiverInfoTool,
  type ReadRiverInfoResult,
  type RiverInfo,
  type RiverInfoPackLike,
  type RiverInfoRuntime,
  readRiverInfoFromPack,
} from "./get-river-info";

interface FakePack {
  rivers: Array<RawRiver | undefined>;
  cells: {
    p: Array<[number, number] | undefined>;
    r: number[];
  };
}

function makePack(): FakePack {
  return {
    rivers: [
      {
        i: 1,
        name: "Great River",
        type: "River",
        length: 500,
        discharge: 120,
        widthFactor: 1.2,
        source: 10,
        mouth: 20,
        parent: 1, // self-reference → no parent
        basin: 1,
        cells: [10, 11, 12, 13, 14, 20],
      },
      undefined,
      undefined,
      undefined,
      {
        i: 4,
        name: "Fernbrook",
        type: "Stream",
        length: 150,
        discharge: 30,
        widthFactor: 0.6,
        source: 30,
        mouth: 12,
        parent: 1, // tributary of Great River
        basin: 1,
        // no cells array — must fall back to scanning cells.r
      },
      {
        i: 5,
        name: "Whistle Creek",
        type: "Creek",
        length: 40,
        discharge: 5,
        widthFactor: 0.3,
        source: 40,
        mouth: 30,
        parent: 4, // tributary of Fernbrook
        basin: 1,
        cells: [40, 41, 30],
      },
      undefined,
      undefined,
      undefined,
      {
        i: 9,
        name: "Ghost River",
        type: "River",
        length: 10,
        discharge: 1,
        widthFactor: 0.1,
        source: 50,
        mouth: 51,
        removed: true,
      },
      undefined,
      undefined,
      {
        i: 12,
        name: "Lone Flow",
        // no type, no length, no discharge, no widthFactor, no cells, etc.
      },
    ],
    cells: {
      p: new Array(60).fill(undefined) as Array<[number, number] | undefined>,
      r: new Array(60).fill(0) as number[],
    },
  };
}

function seedCells(pack: FakePack): FakePack {
  pack.cells.p[10] = [100, 200]; // Great River source
  pack.cells.p[20] = [300, 400]; // Great River mouth
  pack.cells.p[30] = [500, 600];
  pack.cells.p[40] = [700, 800];
  pack.cells.p[12] = [310, 410];
  // Simulate cells.r assignments for Fernbrook (river 4) since it has no cells array.
  pack.cells.r[30] = 4;
  pack.cells.r[31] = 4;
  pack.cells.r[32] = 4;
  pack.cells.r[33] = 4;
  return pack;
}

function runtimeReturning(result: ReadRiverInfoResult): RiverInfoRuntime {
  return { readRiverInfo: () => result };
}

function pureRead(ref: number | string): ReadRiverInfoResult {
  return readRiverInfoFromPack(
    seedCells(makePack()) as unknown as RiverInfoPackLike,
    ref,
  );
}

describe("get_river_info tool — pure / seam", () => {
  it("returns a full dossier for a fully populated river (numeric id)", async () => {
    const info = pureRead(1);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const tool = createGetRiverInfoTool(runtimeReturning(info));
    const result = await tool.execute({ river: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.i).toBe(1);
    expect(body.name).toBe("Great River");
    expect(body.type).toBe("River");
    expect(body.length).toBe(500);
    expect(body.discharge).toBe(120);
    expect(body.widthFactor).toBe(1.2);
    expect(body.source).toEqual({ cell: 10, x: 100, y: 200 });
    expect(body.mouth).toEqual({ cell: 20, x: 300, y: 400 });
    // self-reference parent → null
    expect(body.parent).toBeNull();
    expect(body.basin).toEqual({ id: 1, name: "Great River" });
    // 6 entries in the cells array
    expect(body.cells).toBe(6);
  });

  it("resolves parent and basin names for tributaries", () => {
    const info = pureRead(4) as RiverInfo;
    expect(info.parent).toEqual({ id: 1, name: "Great River" });
    expect(info.basin).toEqual({ id: 1, name: "Great River" });
  });

  it("falls back to scanning pack.cells.r when river.cells is absent", () => {
    // Fernbrook (river 4) has no cells array; cells.r has 4 entries set to 4.
    const info = pureRead(4) as RiverInfo;
    expect(info.cells).toBe(4);
  });

  it("deeper tributary points at its immediate parent, not the basin", () => {
    const info = pureRead(5) as RiverInfo;
    expect(info.parent).toEqual({ id: 4, name: "Fernbrook" });
    expect(info.basin).toEqual({ id: 1, name: "Great River" });
    // cells array has 3 entries
    expect(info.cells).toBe(3);
  });

  it("parent/basin carry {id, name: null} when the referenced river is missing or removed", () => {
    const pack = makePack();
    const r = pack.rivers[1]; // index 1 is undefined; use a real row.
    // Mutate Great River (index 0) to point to nonexistent parent.
    const great = pack.rivers[0];
    if (great) {
      great.parent = 99;
      great.basin = 99;
    }
    void r;
    const info = readRiverInfoFromPack(
      pack as unknown as RiverInfoPackLike,
      1,
    ) as RiverInfo;
    expect(info.parent).toEqual({ id: 99, name: null });
    expect(info.basin).toEqual({ id: 99, name: null });
  });

  it("parent referencing a removed river still echoes the id with null name", () => {
    const pack = makePack();
    const great = pack.rivers[0];
    if (great) great.parent = 9; // Ghost River is removed
    const info = readRiverInfoFromPack(
      pack as unknown as RiverInfoPackLike,
      1,
    ) as RiverInfo;
    expect(info.parent).toEqual({ id: 9, name: null });
  });

  it("parent is null when river.parent === river.i (self-reference)", () => {
    const info = pureRead(1) as RiverInfo;
    expect(info.parent).toBeNull();
  });

  it("parent is null when river.parent is missing entirely", () => {
    const info = pureRead(12) as RiverInfo;
    expect(info.parent).toBeNull();
  });

  it("basin is null when river.basin is missing", () => {
    const info = pureRead(12) as RiverInfo;
    expect(info.basin).toBeNull();
  });

  it("source/mouth are null when the river lacks those fields", () => {
    const info = pureRead(12) as RiverInfo;
    expect(info.source).toBeNull();
    expect(info.mouth).toBeNull();
  });

  it("source/mouth return {cell, x: null, y: null} when cells.p is absent", () => {
    const pack = makePack();
    // Don't seed cells.p — all entries remain undefined.
    const info = readRiverInfoFromPack(
      pack as unknown as RiverInfoPackLike,
      1,
    ) as RiverInfo;
    expect(info.source).toEqual({ cell: 10, x: null, y: null });
    expect(info.mouth).toEqual({ cell: 20, x: null, y: null });
  });

  it("numeric fields default to 0 when missing", () => {
    const info = pureRead(12) as RiverInfo;
    expect(info.length).toBe(0);
    expect(info.discharge).toBe(0);
    expect(info.widthFactor).toBe(0);
    expect(info.cells).toBe(0);
    expect(info.type).toBeNull();
  });

  it("matches by non-contiguous numeric id", () => {
    const info = pureRead(12) as RiverInfo;
    expect(info.i).toBe(12);
    expect(info.name).toBe("Lone Flow");
  });

  it("matches by case-insensitive name", () => {
    const info = pureRead("great river") as RiverInfo;
    expect(info.i).toBe(1);
    expect(info.name).toBe("Great River");
  });

  it("returns 'not-found' for removed rivers", () => {
    expect(pureRead(9)).toBe("not-found");
    expect(pureRead("Ghost River")).toBe("not-found");
  });

  it("returns 'not-found' for unknown numeric and name refs", () => {
    expect(pureRead(999)).toBe("not-found");
    expect(pureRead("nonesuch")).toBe("not-found");
  });

  it("returns 'not-ready' when pack or pack.rivers is missing", () => {
    expect(readRiverInfoFromPack(undefined, 1)).toBe("not-ready");
    expect(
      readRiverInfoFromPack({ rivers: undefined } as RiverInfoPackLike, 1),
    ).toBe("not-ready");
  });

  it("tool rejects non-integer / missing / empty refs via parseEntityRef", async () => {
    const tool = createGetRiverInfoTool(runtimeReturning("not-found"));
    for (const bad of [
      {},
      { river: 1.5 },
      { river: null },
      { river: "" },
      { river: 0 },
      { river: -1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /positive integer id or a non-empty name/i,
      );
    }
  });

  it("surfaces not-ready as a structured error", async () => {
    const tool = createGetRiverInfoTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ river: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces not-found as a structured error with the ref quoted", async () => {
    const tool = createGetRiverInfoTool(runtimeReturning("not-found"));
    const result = await tool.execute({ river: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No river found/i);
    expect(JSON.parse(result.content).error).toMatch(/"foo"/);
  });

  it("is exported as getRiverInfoTool with the expected schema", () => {
    expect(getRiverInfoTool.name).toBe("get_river_info");
    expect(getRiverInfoTool.input_schema.type).toBe("object");
    expect(getRiverInfoTool.input_schema.required).toEqual(["river"]);
    expect(getRiverInfoTool.input_schema.properties.river).toBeDefined();
  });
});

// ----- defaultRiverInfoRuntime integration -----

describe("defaultRiverInfoRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = seedCells(makePack()) as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads a real river via the default runtime", () => {
    const info = defaultRiverInfoRuntime.readRiverInfo(1);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const ri = info as RiverInfo;
    expect(ri.i).toBe(1);
    expect(ri.name).toBe("Great River");
    expect(ri.basin).toEqual({ id: 1, name: "Great River" });
    expect(ri.source).toEqual({ cell: 10, x: 100, y: 200 });
  });

  it("returns 'not-ready' when pack is missing", async () => {
    globalsRef.pack = undefined;
    expect(defaultRiverInfoRuntime.readRiverInfo(1)).toBe("not-ready");
    const result = await getRiverInfoTool.execute({ river: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-found' for unknown river id through the tool", async () => {
    const result = await getRiverInfoTool.execute({ river: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No river found/i);
  });

  it("returns 'not-found' for a removed river through the tool", async () => {
    const result = await getRiverInfoTool.execute({ river: 9 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No river found/i);
  });
});
