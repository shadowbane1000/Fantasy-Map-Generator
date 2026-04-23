import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createListFeaturesTool,
  defaultFeaturesRuntime,
  type FeaturePackLike,
  type FeatureSummary,
  type FeaturesRuntime,
  listFeaturesTool,
  readFeaturesFromPack,
} from "./list-features";

interface FakeFeature {
  i?: number;
  type?: string;
  group?: string;
  name?: string;
  land?: boolean;
  border?: boolean;
  cells?: number;
  area?: number;
}

interface FakePack {
  features: Array<FakeFeature | 0 | undefined | null>;
}

function makePack(): FakePack {
  return {
    features: [
      0, // placeholder
      // 1: continent
      {
        i: 1,
        type: "island",
        group: "continent",
        name: "Elderland",
        land: true,
        border: false,
        cells: 1250,
        area: 4200,
      },
      // 2: ocean (border)
      {
        i: 2,
        type: "ocean",
        group: "ocean",
        land: false,
        border: true,
        cells: 3000,
        area: 12000,
      },
      // 3: freshwater lake
      {
        i: 3,
        type: "lake",
        group: "freshwater",
        name: "Mirror Lake",
        land: false,
        border: false,
        cells: 12,
        area: 45,
      },
      // 4: island (non-continent)
      {
        i: 4,
        type: "island",
        group: "isle",
        name: "Lonely Isle",
        land: true,
        border: false,
        cells: 40,
        area: 80,
      },
      // 5: undefined slot — should be skipped.
      undefined,
    ],
  };
}

function fakeFeatures(): FeatureSummary[] {
  return [
    {
      i: 1,
      type: "island",
      group: "continent",
      name: "Elderland",
      land: true,
      border: false,
      cells: 1250,
      area: 4200,
    },
    {
      i: 2,
      type: "ocean",
      group: "ocean",
      name: null,
      land: false,
      border: true,
      cells: 3000,
      area: 12000,
    },
    {
      i: 3,
      type: "lake",
      group: "freshwater",
      name: "Mirror Lake",
      land: false,
      border: false,
      cells: 12,
      area: 45,
    },
    {
      i: 4,
      type: "island",
      group: "isle",
      name: "Lonely Isle",
      land: true,
      border: false,
      cells: 40,
      area: 80,
    },
  ];
}

function runtimeOf(features: FeatureSummary[] | null): FeaturesRuntime {
  return { readFeatures: () => features };
}

describe("list_features tool", () => {
  it("returns every feature by default", async () => {
    const tool = createListFeaturesTool(runtimeOf(fakeFeatures()));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(4);
    expect(body.features.map((f: FeatureSummary) => f.i)).toEqual([1, 2, 3, 4]);
    expect(body.filters).toEqual({ type: null, land: null });
  });

  it("filters type=island (case-insensitive)", async () => {
    const tool = createListFeaturesTool(runtimeOf(fakeFeatures()));
    const result = await tool.execute({ type: "ISLAND" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.features.map((f: FeatureSummary) => f.i)).toEqual([1, 4]);
    expect(body.filters.type).toBe("island");
  });

  it("filters type=continent — only features with group=continent", async () => {
    const tool = createListFeaturesTool(runtimeOf(fakeFeatures()));
    const result = await tool.execute({ type: "Continent" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.features[0].i).toBe(1);
    expect(body.features[0].group).toBe("continent");
    expect(body.filters.type).toBe("continent");
  });

  it("filters type=lake", async () => {
    const tool = createListFeaturesTool(runtimeOf(fakeFeatures()));
    const result = await tool.execute({ type: "lake" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.features[0].type).toBe("lake");
  });

  it("filters type=ocean", async () => {
    const tool = createListFeaturesTool(runtimeOf(fakeFeatures()));
    const result = await tool.execute({ type: "ocean" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.features[0].type).toBe("ocean");
    expect(body.features[0].border).toBe(true);
  });

  it("filters land:true", async () => {
    const tool = createListFeaturesTool(runtimeOf(fakeFeatures()));
    const result = await tool.execute({ land: true });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.features.map((f: FeatureSummary) => f.i)).toEqual([1, 4]);
    expect(body.filters.land).toBe(true);
  });

  it("filters land:false", async () => {
    const tool = createListFeaturesTool(runtimeOf(fakeFeatures()));
    const result = await tool.execute({ land: false });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.features.map((f: FeatureSummary) => f.i)).toEqual([2, 3]);
    expect(body.filters.land).toBe(false);
  });

  it("combines type + land filters", async () => {
    const tool = createListFeaturesTool(runtimeOf(fakeFeatures()));
    const result = await tool.execute({ type: "island", land: true });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.features.map((f: FeatureSummary) => f.i)).toEqual([1, 4]);
  });

  it("unknown type yields structured error", async () => {
    const tool = createListFeaturesTool(runtimeOf(fakeFeatures()));
    const result = await tool.execute({ type: "swamp" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/type must be one of/i);
  });

  it("rejects non-string type", async () => {
    const tool = createListFeaturesTool(runtimeOf(fakeFeatures()));
    const result = await tool.execute({ type: 42 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/type/i);
  });

  it("rejects empty-string type", async () => {
    const tool = createListFeaturesTool(runtimeOf(fakeFeatures()));
    const result = await tool.execute({ type: "   " });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/type/i);
  });

  it("rejects non-boolean land", async () => {
    const tool = createListFeaturesTool(runtimeOf(fakeFeatures()));
    const result = await tool.execute({ land: "yes" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/land/i);
  });

  it("honors limit and offset", async () => {
    const tool = createListFeaturesTool(runtimeOf(fakeFeatures()));
    const result = await tool.execute({ limit: 2, offset: 1 });
    const body = JSON.parse(result.content);
    expect(body.features.map((f: FeatureSummary) => f.i)).toEqual([2, 3]);
  });

  it("returns not-ready when runtime returns null", async () => {
    const tool = createListFeaturesTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns an empty list when runtime returns []", async () => {
    const tool = createListFeaturesTool(runtimeOf([]));
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    expect(body.total).toBe(0);
    expect(body.features).toEqual([]);
  });

  it("is exported as listFeaturesTool with the expected schema", () => {
    expect(listFeaturesTool.name).toBe("list_features");
    expect(listFeaturesTool.input_schema.type).toBe("object");
    expect(listFeaturesTool.input_schema.properties.type).toBeDefined();
    expect(listFeaturesTool.input_schema.properties.land).toBeDefined();
    expect(listFeaturesTool.input_schema.properties.limit).toBeDefined();
    expect(listFeaturesTool.input_schema.properties.offset).toBeDefined();
  });
});

describe("readFeaturesFromPack", () => {
  it("returns null when pack has no features array", () => {
    expect(readFeaturesFromPack(undefined)).toBeNull();
    expect(readFeaturesFromPack({} as FeaturePackLike)).toBeNull();
  });

  it("skips the index-0 placeholder and falsy slots", () => {
    const result = readFeaturesFromPack(
      makePack() as unknown as FeaturePackLike,
    );
    expect(result).not.toBeNull();
    const arr = result as FeatureSummary[];
    expect(arr.map((f) => f.i)).toEqual([1, 2, 3, 4]);
  });

  it("coerces missing fields to null / 0 / false", () => {
    const pack: FakePack = { features: [0, { i: 7 }] };
    const result = readFeaturesFromPack(
      pack as unknown as FeaturePackLike,
    ) as FeatureSummary[];
    expect(result).toEqual([
      {
        i: 7,
        type: null,
        group: null,
        name: null,
        land: false,
        border: false,
        cells: 0,
        area: 0,
      },
    ]);
  });

  it("normalizes empty string name to null", () => {
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
    const result = readFeaturesFromPack(
      pack as unknown as FeaturePackLike,
    ) as FeatureSummary[];
    expect(result[0].name).toBeNull();
  });

  it("falls back to slot index when entry.i is missing", () => {
    const pack: FakePack = {
      features: [0, { type: "island", land: true }],
    };
    const result = readFeaturesFromPack(
      pack as unknown as FeaturePackLike,
    ) as FeatureSummary[];
    expect(result[0].i).toBe(1);
    expect(result[0].type).toBe("island");
    expect(result[0].land).toBe(true);
  });
});

describe("defaultFeaturesRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads features via the default runtime", async () => {
    const features = defaultFeaturesRuntime.readFeatures();
    expect(features).not.toBeNull();
    const arr = features as FeatureSummary[];
    expect(arr.map((f) => f.i)).toEqual([1, 2, 3, 4]);
    const result = await listFeaturesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(4);
  });

  it("returns not-ready when pack is missing", async () => {
    globalsRef.pack = undefined;
    expect(defaultFeaturesRuntime.readFeatures()).toBeNull();
    const result = await listFeaturesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
