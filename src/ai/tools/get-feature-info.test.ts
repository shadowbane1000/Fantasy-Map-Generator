import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetFeatureInfoTool,
  defaultFeatureInfoRuntime,
  type FeatureInfo,
  type FeatureInfoPackLike,
  type FeatureInfoRuntime,
  getFeatureInfoTool,
  type ReadFeatureInfoResult,
  readFeatureInfoFromPack,
} from "./get-feature-info";

interface FakeFeature {
  i?: number;
  type?: string;
  group?: string;
  name?: string;
  land?: boolean;
  border?: boolean;
  cells?: number;
  area?: number;
  firstCell?: number;
  vertices?: number[];
}

interface FakePack {
  features: Array<FakeFeature | 0 | undefined>;
}

function makePack(): FakePack {
  return {
    // Index 0 is a placeholder — the generator writes `0` there.
    features: [
      0,
      // 1: continent with everything populated.
      {
        i: 1,
        type: "island",
        group: "continent",
        name: "Elder Isle",
        land: true,
        border: false,
        cells: 1250,
        area: 4200,
        firstCell: 42,
        vertices: [10, 20, 30, 40, 50],
      },
      // 2: ocean, no name, border.
      {
        i: 2,
        type: "ocean",
        group: "ocean",
        land: false,
        border: true,
        cells: 3000,
        area: 12000,
        firstCell: 100,
        vertices: [],
      },
      // 3: freshwater lake.
      {
        i: 3,
        type: "lake",
        group: "freshwater",
        name: "Mirror Lake",
        land: false,
        border: false,
        cells: 12,
        area: 45,
        firstCell: 555,
        vertices: [101, 102, 103],
      },
      // 4: empty slot — should be treated as not-found.
      undefined,
    ],
  };
}

function runtimeReturning(result: ReadFeatureInfoResult): FeatureInfoRuntime {
  return { readFeatureInfo: () => result };
}

function pureRead(id: number): ReadFeatureInfoResult {
  return readFeatureInfoFromPack(
    makePack() as unknown as FeatureInfoPackLike,
    id,
  );
}

describe("get_feature_info tool — pure / seam", () => {
  it("returns all fields for a fully populated continent feature", async () => {
    const info = pureRead(1);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const tool = createGetFeatureInfoTool(runtimeReturning(info));
    const result = await tool.execute({ feature: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.i).toBe(1);
    expect(body.type).toBe("island");
    expect(body.group).toBe("continent");
    expect(body.name).toBe("Elder Isle");
    expect(body.land).toBe(true);
    expect(body.border).toBe(false);
    expect(body.cells).toBe(1250);
    expect(body.area).toBe(4200);
    expect(body.firstCell).toBe(42);
    expect(body.vertices_count).toBe(5);
  });

  it("returns name: null for an ocean feature without a name", () => {
    const info = pureRead(2) as FeatureInfo;
    expect(info.i).toBe(2);
    expect(info.type).toBe("ocean");
    expect(info.group).toBe("ocean");
    expect(info.name).toBeNull();
    expect(info.land).toBe(false);
    expect(info.border).toBe(true);
    expect(info.vertices_count).toBe(0);
  });

  it("resolves a lake feature's type / group / name", () => {
    const info = pureRead(3) as FeatureInfo;
    expect(info.type).toBe("lake");
    expect(info.group).toBe("freshwater");
    expect(info.name).toBe("Mirror Lake");
    expect(info.cells).toBe(12);
    expect(info.firstCell).toBe(555);
    expect(info.vertices_count).toBe(3);
  });

  it("coerces missing optional fields to null / defaults", () => {
    const pack: FakePack = {
      features: [0, { i: 1 }],
    };
    const info = readFeatureInfoFromPack(
      pack as unknown as FeatureInfoPackLike,
      1,
    ) as FeatureInfo;
    expect(info.type).toBeNull();
    expect(info.group).toBeNull();
    expect(info.name).toBeNull();
    expect(info.land).toBe(false);
    expect(info.border).toBe(false);
    expect(info.cells).toBe(0);
    expect(info.area).toBe(0);
    expect(info.firstCell).toBeNull();
    expect(info.vertices_count).toBe(0);
  });

  it("empty string name is normalised to null", () => {
    const pack: FakePack = {
      features: [
        0,
        {
          i: 1,
          type: "ocean",
          group: "ocean",
          name: "",
          land: false,
          border: true,
          cells: 10,
          area: 20,
        },
      ],
    };
    const info = readFeatureInfoFromPack(
      pack as unknown as FeatureInfoPackLike,
      1,
    ) as FeatureInfo;
    expect(info.name).toBeNull();
  });

  it("falls back to the requested id when entry.i is missing", () => {
    const pack: FakePack = {
      features: [0, { type: "island", land: true }],
    };
    const info = readFeatureInfoFromPack(
      pack as unknown as FeatureInfoPackLike,
      1,
    ) as FeatureInfo;
    expect(info.i).toBe(1);
    expect(info.type).toBe("island");
    expect(info.land).toBe(true);
  });

  it("rejects feature id 0 (placeholder) through the tool", async () => {
    const tool = createGetFeatureInfoTool({
      readFeatureInfo: (id) =>
        readFeatureInfoFromPack(
          makePack() as unknown as FeatureInfoPackLike,
          id,
        ),
    });
    const result = await tool.execute({ feature: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No feature found/i);
  });

  it("rejects negative feature id", async () => {
    const tool = createGetFeatureInfoTool({
      readFeatureInfo: (id) =>
        readFeatureInfoFromPack(
          makePack() as unknown as FeatureInfoPackLike,
          id,
        ),
    });
    const result = await tool.execute({ feature: -1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No feature found/i);
  });

  it("rejects out-of-range feature id", async () => {
    const tool = createGetFeatureInfoTool({
      readFeatureInfo: (id) =>
        readFeatureInfoFromPack(
          makePack() as unknown as FeatureInfoPackLike,
          id,
        ),
    });
    const result = await tool.execute({ feature: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No feature found/i);
  });

  it("rejects an empty / undefined slot as not-found", async () => {
    const tool = createGetFeatureInfoTool({
      readFeatureInfo: (id) =>
        readFeatureInfoFromPack(
          makePack() as unknown as FeatureInfoPackLike,
          id,
        ),
    });
    // index 4 in fixture is undefined.
    const result = await tool.execute({ feature: 4 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No feature found/i);
  });

  it("rejects non-integer / missing feature", async () => {
    const tool = createGetFeatureInfoTool(
      runtimeReturning(pureRead(1) as FeatureInfo),
    );
    for (const bad of [
      {},
      { feature: "1" },
      { feature: 1.5 },
      { feature: null },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/integer/i);
    }
  });

  it("surfaces not-ready as a structured error", async () => {
    const tool = createGetFeatureInfoTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ feature: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-ready' from the pure reader when pack / features missing", () => {
    expect(readFeatureInfoFromPack(undefined, 1)).toBe("not-ready");
    expect(readFeatureInfoFromPack({} as FeatureInfoPackLike, 1)).toBe(
      "not-ready",
    );
  });

  it("is exported as getFeatureInfoTool with the expected schema", () => {
    expect(getFeatureInfoTool.name).toBe("get_feature_info");
    expect(getFeatureInfoTool.input_schema.type).toBe("object");
    expect(getFeatureInfoTool.input_schema.required).toEqual(["feature"]);
    expect(getFeatureInfoTool.input_schema.properties.feature).toBeDefined();
  });
});

// ----- defaultFeatureInfoRuntime integration -----

describe("defaultFeatureInfoRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads a real feature via the default runtime", () => {
    const info = defaultFeatureInfoRuntime.readFeatureInfo(1);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const fi = info as FeatureInfo;
    expect(fi.i).toBe(1);
    expect(fi.name).toBe("Elder Isle");
    expect(fi.type).toBe("island");
    expect(fi.group).toBe("continent");
    expect(fi.land).toBe(true);
    expect(fi.cells).toBe(1250);
    expect(fi.firstCell).toBe(42);
    expect(fi.vertices_count).toBe(5);
  });

  it("returns 'not-ready' when pack is missing", async () => {
    globalsRef.pack = undefined;
    expect(defaultFeatureInfoRuntime.readFeatureInfo(1)).toBe("not-ready");
    const result = await getFeatureInfoTool.execute({ feature: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-found' for feature id 0 through the tool", async () => {
    const result = await getFeatureInfoTool.execute({ feature: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No feature found/i);
  });

  it("returns 'not-found' for unknown feature id through the tool", async () => {
    const result = await getFeatureInfoTool.execute({ feature: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No feature found/i);
  });
});
