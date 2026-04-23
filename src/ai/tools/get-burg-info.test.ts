import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type BurgInfo,
  type BurgInfoRuntime,
  createGetBurgInfoTool,
  defaultBurgInfoRuntime,
  getBurgInfoTool,
  type PackLike,
  type ReadBurgInfoResult,
  readBurgInfoFromPack,
} from "./get-burg-info";

interface FakePack {
  burgs: Array<
    | {
        i: number;
        name?: string;
        x?: number;
        y?: number;
        cell?: number;
        state?: number;
        culture?: number;
        capital?: number;
        port?: number;
        type?: string;
        group?: string;
        population?: number;
        citadel?: number;
        walls?: number;
        plaza?: number;
        temple?: number;
        shanty?: number;
        coa?: { custom?: unknown } & Record<string, unknown>;
        lock?: boolean;
        removed?: boolean;
      }
    | undefined
  >;
  states: Array<{ i?: number; name?: string } | undefined>;
  provinces: Array<{ i?: number; name?: string } | undefined>;
  cultures: Array<{ i?: number; name?: string } | undefined>;
  religions: Array<{ i?: number; name?: string } | undefined>;
  cells: { religion: number[]; province: number[] };
}

function makePack(): FakePack {
  return {
    burgs: [
      { i: 0, name: "placeholder" },
      {
        i: 1,
        name: "Stormport",
        x: 100,
        y: 200,
        cell: 10,
        state: 3,
        culture: 2,
        capital: 1,
        port: 7,
        type: "Generic",
        group: "cities",
        population: 12.5,
        citadel: 1,
        walls: 1,
        plaza: 0,
        temple: 1,
        shanty: 0,
        coa: { custom: true, shield: "heater" },
        lock: true,
      },
      {
        i: 2,
        name: "Drifthollow",
        x: 400,
        y: 50,
        cell: 12,
        state: 0,
        culture: 99, // unknown culture id
        capital: 0,
        port: 0,
        type: "Nomadic",
        group: "towns",
        population: 3,
        // no feature flags set
        // no coa
        lock: false,
      },
      {
        i: 3,
        name: "Ghosttown",
        removed: true,
      },
    ],
    states: [{ name: "Neutrals" }, undefined, undefined, { name: "Altaria" }],
    provinces: [
      undefined,
      undefined,
      undefined,
      undefined,
      { name: "Rookmark" },
    ],
    cultures: [{ name: "Wildlands" }, undefined, { name: "Highlanders" }],
    religions: [
      { name: "No religion" },
      undefined,
      undefined,
      undefined,
      undefined,
      { name: "Old Faith" },
    ],
    cells: {
      // cell 10 has religion 5 + province 4; cell 12 is neutrals everywhere.
      religion: new Array(20).fill(0),
      province: new Array(20).fill(0),
    },
  };
}

function seedCells(pack: FakePack): FakePack {
  pack.cells.religion[10] = 5;
  pack.cells.province[10] = 4;
  return pack;
}

function runtimeReturning(result: ReadBurgInfoResult): BurgInfoRuntime {
  return { readBurgInfo: () => result };
}

function pureRead(ref: number | string): ReadBurgInfoResult {
  return readBurgInfoFromPack(
    seedCells(makePack()) as unknown as PackLike,
    ref,
  );
}

describe("get_burg_info tool — pure / seam", () => {
  it("returns the full dossier for a fully populated burg (numeric id)", async () => {
    const info = pureRead(1);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const tool = createGetBurgInfoTool(runtimeReturning(info));
    const result = await tool.execute({ burg: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.i).toBe(1);
    expect(body.name).toBe("Stormport");
    expect(body.cell).toBe(10);
    expect(body.x).toBe(100);
    expect(body.y).toBe(200);
    expect(body.population).toBe(12.5);
    expect(body.culture).toEqual({ id: 2, name: "Highlanders" });
    expect(body.religion).toEqual({ id: 5, name: "Old Faith" });
    expect(body.state).toEqual({ id: 3, name: "Altaria" });
    expect(body.province).toEqual({ id: 4, name: "Rookmark" });
    expect(body.type).toBe("Generic");
    expect(body.group).toBe("cities");
    expect(body.feature_flags).toEqual({
      citadel: true,
      walls: true,
      plaza: false,
      temple: true,
      shanty: false,
    });
    expect(body.port).toBe(true);
    expect(body.port_feature).toBe(7);
    expect(body.capital).toBe(true);
    expect(body.coa).toEqual({ present: true, custom: true });
    expect(body.lock).toBe(true);
  });

  it("resolves case-insensitive name refs", () => {
    const info = pureRead("STORMPORT") as BurgInfo;
    expect(info).not.toBe("not-ready");
    expect(info.i).toBe(1);
    expect(info.name).toBe("Stormport");
  });

  it("returns null names for unknown culture/religion/state/province ids", () => {
    const info = pureRead(2) as BurgInfo;
    // culture 99 is out of range → name null but id preserved.
    expect(info.culture).toEqual({ id: 99, name: null });
    // state 0 falls back to the neutral state entry.
    expect(info.state).toEqual({ id: 0, name: "Neutrals" });
    // cell 12 has religion 0 and province 0 → neutral slot.
    expect(info.religion).toEqual({ id: 0, name: "No religion" });
    expect(info.province).toEqual({ id: 0, name: null });
  });

  it("booleanizes feature_flags from raw 0/1/undefined", () => {
    const info = pureRead(2) as BurgInfo;
    expect(info.feature_flags).toEqual({
      citadel: false,
      walls: false,
      plaza: false,
      temple: false,
      shanty: false,
    });
  });

  it("reports coa.present false when no coa object", () => {
    const info = pureRead(2) as BurgInfo;
    expect(info.coa).toEqual({ present: false, custom: false });
  });

  it("capital only true when burg.capital === 1", () => {
    expect((pureRead(1) as BurgInfo).capital).toBe(true);
    expect((pureRead(2) as BurgInfo).capital).toBe(false);
  });

  it("port is boolean; port_feature carries raw feature id", () => {
    expect((pureRead(1) as BurgInfo).port).toBe(true);
    expect((pureRead(1) as BurgInfo).port_feature).toBe(7);
    expect((pureRead(2) as BurgInfo).port).toBe(false);
    expect((pureRead(2) as BurgInfo).port_feature).toBeNull();
  });

  it("rejects the index-0 placeholder", async () => {
    const tool = createGetBurgInfoTool({
      readBurgInfo: (ref) =>
        readBurgInfoFromPack(seedCells(makePack()) as unknown as PackLike, ref),
    });
    const result = await tool.execute({ burg: 0 });
    expect(result.isError).toBe(true);
    // parseEntityRef rejects 0 because it's not > 0.
    expect(JSON.parse(result.content).error).toMatch(/positive integer/i);
  });

  it("rejects removed burgs as not-found", async () => {
    expect(pureRead(3)).toBe("not-found");
    const tool = createGetBurgInfoTool({
      readBurgInfo: (ref) =>
        readBurgInfoFromPack(seedCells(makePack()) as unknown as PackLike, ref),
    });
    const result = await tool.execute({ burg: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no burg found/i);
  });

  it("rejects unknown numeric and name refs", () => {
    expect(pureRead(999)).toBe("not-found");
    expect(pureRead("nonesuch")).toBe("not-found");
  });

  it("rejects non-int-non-string refs", async () => {
    const tool = createGetBurgInfoTool(
      runtimeReturning(pureRead(1) as BurgInfo),
    );
    for (const bad of [{}, { burg: 1.5 }, { burg: null }, { burg: "" }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/positive integer/i);
    }
  });

  it("surfaces not-ready as a structured error", async () => {
    const tool = createGetBurgInfoTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ burg: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("handles pack with no cells.religion / cells.province gracefully", () => {
    const pack = makePack() as unknown as PackLike;
    // Drop cells entirely.
    (pack as { cells?: unknown }).cells = undefined;
    const info = readBurgInfoFromPack(pack, 1) as BurgInfo;
    expect(info.religion).toEqual({ id: 0, name: "No religion" });
    expect(info.province).toEqual({ id: 0, name: null });
  });

  it("is exported as getBurgInfoTool with the expected schema", () => {
    expect(getBurgInfoTool.name).toBe("get_burg_info");
    expect(getBurgInfoTool.input_schema.type).toBe("object");
    expect(getBurgInfoTool.input_schema.required).toEqual(["burg"]);
    expect(getBurgInfoTool.input_schema.properties.burg).toBeDefined();
  });
});

// ----- defaultBurgInfoRuntime integration -----

describe("defaultBurgInfoRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = seedCells(makePack()) as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads a real burg via the default runtime", () => {
    const info = defaultBurgInfoRuntime.readBurgInfo(1);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const b = info as BurgInfo;
    expect(b.i).toBe(1);
    expect(b.name).toBe("Stormport");
    expect(b.state).toEqual({ id: 3, name: "Altaria" });
    expect(b.religion).toEqual({ id: 5, name: "Old Faith" });
    expect(b.province).toEqual({ id: 4, name: "Rookmark" });
  });

  it("returns 'not-ready' when pack is missing", async () => {
    globalsRef.pack = undefined;
    expect(defaultBurgInfoRuntime.readBurgInfo(1)).toBe("not-ready");
    const result = await getBurgInfoTool.execute({ burg: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-found' for unknown burgs through the tool", async () => {
    const result = await getBurgInfoTool.execute({ burg: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no burg found/i);
  });
});
