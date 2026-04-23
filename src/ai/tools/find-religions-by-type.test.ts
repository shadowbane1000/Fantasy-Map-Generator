import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindReligionsByTypeTool,
  DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
  defaultFindReligionsByTypeRuntime,
  type FindReligionsByTypeResult,
  type FindReligionsByTypeRuntime,
  findReligionsByTypeInPack,
  findReligionsByTypeTool,
  MAX_FIND_RELIGIONS_BY_TYPE_LIMIT,
} from "./find-religions-by-type";

interface FakePack {
  religions: Array<{
    i: number;
    name?: string;
    color?: string;
    type?: string;
    form?: string;
    deity?: string | null;
    culture?: number;
    removed?: boolean;
  }>;
  cultures: Array<{
    i: number;
    name?: string;
    removed?: boolean;
  }>;
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findReligionsByTypeInPack>[0];
}

function makePack(): FakePack {
  // Cultures (only names needed for culture lookup):
  //   0: "Wildlands"
  //   1: "Highlanders"
  //   2: "Seafarers"
  //   3: "Gonelanders" (removed)
  //
  // Religions:
  //   0: "No religion" (always skipped) — type Folk, but i===0
  //   1: "Solarism"     type Folk,      culture=1 "Highlanders"
  //   2: "Moonrise"     type folk       culture=2 "Seafarers"  (lowercase — still matches Folk)
  //   3: "Empyrism"     type Organized, culture=1 "Highlanders"
  //   4: "Tide Church"  type Organized, culture=2 "Seafarers"
  //   5: "Ashcult"      type Cult,      culture=1 "Highlanders"
  //   6: "Hollowsect"   type Organized, removed: true — skipped
  //   7: "Orphan"       no type field — skipped
  //   8: "Dustfaith"    type Folk,      culture=0 (Wildlands — culture null)
  //   9: "Lostfaith"    type Folk,      culture=99 (missing culture → null)
  //  10: "Ghostwind"    type Folk,      culture=3 (removed culture → null)
  //  11: "Orphanfaith"  type Folk,      culture missing entirely
  return {
    religions: [
      { i: 0, name: "No religion", type: "Folk" },
      {
        i: 1,
        name: "Solarism",
        color: "#aabbcc",
        type: "Folk",
        form: "Shamanism",
        deity: "Helios, the Sunlord",
        culture: 1,
      },
      {
        i: 2,
        name: "Moonrise",
        color: "#112233",
        type: "folk",
        form: "Animism",
        deity: "Luna",
        culture: 2,
      },
      {
        i: 3,
        name: "Empyrism",
        color: "#445566",
        type: "Organized",
        form: "Theism",
        deity: "The Empyrean",
        culture: 1,
      },
      {
        i: 4,
        name: "Tide Church",
        color: "#778899",
        type: "Organized",
        form: "Monotheism",
        deity: "The Tide",
        culture: 2,
      },
      {
        i: 5,
        name: "Ashcult",
        color: "#abcdef",
        type: "Cult",
        form: "Cult",
        deity: null,
        culture: 1,
      },
      {
        i: 6,
        name: "Hollowsect",
        type: "Organized",
        culture: 2,
        removed: true,
      },
      { i: 7, name: "Orphan", culture: 1 },
      {
        i: 8,
        name: "Dustfaith",
        type: "Folk",
        culture: 0,
      },
      {
        i: 9,
        name: "Lostfaith",
        type: "Folk",
        culture: 99,
      },
      {
        i: 10,
        name: "Ghostwind",
        type: "Folk",
        culture: 3,
      },
      {
        i: 11,
        name: "Orphanfaith",
        type: "Folk",
      },
    ],
    cultures: [
      { i: 0, name: "Wildlands" },
      { i: 1, name: "Highlanders" },
      { i: 2, name: "Seafarers" },
      { i: 3, name: "Gonelanders", removed: true },
    ],
  };
}

function runtimeReturning(
  result: FindReligionsByTypeResult,
): FindReligionsByTypeRuntime {
  return { find: () => result };
}

function realRuntime(): FindReligionsByTypeRuntime {
  const pack = asPack(makePack());
  return {
    find: (type, limit) => findReligionsByTypeInPack(pack, type, limit),
  };
}

describe("find_religions_by_type — pure scanner", () => {
  it("matches religions by type case-insensitively (Folk)", () => {
    const result = findReligionsByTypeInPack(
      asPack(makePack()),
      "Folk",
      DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
    ) as {
      type: string;
      religions: Array<{ i: number; culture: string | null }>;
      count: number;
    };
    const ids = new Set(result.religions.map((r) => r.i));
    // Folk religions: 1 ("Folk"), 2 ("folk"), 8, 9, 10, 11; i=0 skipped
    expect(ids).toEqual(new Set([1, 2, 8, 9, 10, 11]));
    expect(result.count).toBe(6);
    expect(result.type).toBe("Folk");
    const byId = new Map(result.religions.map((r) => [r.i, r]));
    expect(byId.get(1)?.culture).toBe("Highlanders");
    expect(byId.get(2)?.culture).toBe("Seafarers");
    expect(byId.get(8)?.culture).toBeNull(); // culture=0 Wildlands
    expect(byId.get(9)?.culture).toBeNull(); // culture=99 (missing)
    expect(byId.get(10)?.culture).toBeNull(); // culture=3 removed
    expect(byId.get(11)?.culture).toBeNull(); // no culture field
  });

  it("returns religions for a second type cleanly (no cross-contamination)", () => {
    const result = findReligionsByTypeInPack(
      asPack(makePack()),
      "Organized",
      DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
    ) as {
      religions: Array<{ i: number; culture: string | null }>;
      count: number;
    };
    const ids = new Set(result.religions.map((r) => r.i));
    // Organized: 3, 4; 6 is removed
    expect(ids).toEqual(new Set([3, 4]));
    expect(result.count).toBe(2);
    const byId = new Map(result.religions.map((r) => [r.i, r]));
    expect(byId.get(3)?.culture).toBe("Highlanders");
    expect(byId.get(4)?.culture).toBe("Seafarers");
  });

  it("returns empty list when no religion has the given type", () => {
    const result = findReligionsByTypeInPack(
      asPack(makePack()),
      "Heresy",
      DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
    ) as { religions: unknown[]; count: number };
    expect(result.religions).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("skips i=0 placeholder, removed religions, and religions with no type", () => {
    // Cult has only one match: 5.
    const cult = findReligionsByTypeInPack(
      asPack(makePack()),
      "Cult",
      DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
    ) as { religions: Array<{ i: number }>; count: number };
    expect(new Set(cult.religions.map((r) => r.i))).toEqual(new Set([5]));
    expect(cult.count).toBe(1);

    const folk = findReligionsByTypeInPack(
      asPack(makePack()),
      "Folk",
      DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
    ) as { religions: Array<{ i: number }>; count: number };
    const ids = new Set(folk.religions.map((r) => r.i));
    expect(ids.has(0)).toBe(false); // placeholder skipped
    expect(ids.has(7)).toBe(false); // no type skipped

    const organized = findReligionsByTypeInPack(
      asPack(makePack()),
      "Organized",
      DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
    ) as { religions: Array<{ i: number }>; count: number };
    expect(new Set(organized.religions.map((r) => r.i)).has(6)).toBe(false); // removed
  });

  it("truncates `religions` at limit but preserves full `count`", () => {
    const result = findReligionsByTypeInPack(asPack(makePack()), "Folk", 2) as {
      religions: Array<{ i: number }>;
      count: number;
    };
    expect(result.religions.length).toBe(2);
    expect(result.count).toBe(6);
  });

  it("populates name, color, form, deity, culture fields", () => {
    const result = findReligionsByTypeInPack(
      asPack(makePack()),
      "Organized",
      DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
    ) as {
      religions: Array<{
        i: number;
        name: string;
        color: string | null;
        form: string | null;
        deity: string | null;
        culture: string | null;
      }>;
    };
    const byId = new Map(result.religions.map((r) => [r.i, r]));
    expect(byId.get(3)).toEqual({
      i: 3,
      name: "Empyrism",
      color: "#445566",
      form: "Theism",
      deity: "The Empyrean",
      culture: "Highlanders",
    });
  });

  it("falls back to null for missing color / form / deity", () => {
    const result = findReligionsByTypeInPack(
      asPack(makePack()),
      "Folk",
      DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
    ) as {
      religions: Array<{
        i: number;
        color: string | null;
        form: string | null;
        deity: string | null;
      }>;
    };
    const byId = new Map(result.religions.map((r) => [r.i, r]));
    // religion 8 "Dustfaith" has only name + type + culture
    expect(byId.get(8)?.color).toBeNull();
    expect(byId.get(8)?.form).toBeNull();
    expect(byId.get(8)?.deity).toBeNull();
  });

  it("returns culture=null when culture=0 (Wildlands), missing, or removed", () => {
    const result = findReligionsByTypeInPack(
      asPack(makePack()),
      "Folk",
      DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
    ) as {
      religions: Array<{ i: number; culture: string | null }>;
    };
    const byId = new Map(result.religions.map((r) => [r.i, r]));
    expect(byId.get(8)?.culture).toBeNull(); // culture=0 Wildlands
    expect(byId.get(9)?.culture).toBeNull(); // culture=99 (missing)
    expect(byId.get(10)?.culture).toBeNull(); // culture=3 removed
    expect(byId.get(11)?.culture).toBeNull(); // no culture field
  });

  it("returns null deity when raw deity is null", () => {
    const result = findReligionsByTypeInPack(
      asPack(makePack()),
      "Cult",
      DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
    ) as {
      religions: Array<{ i: number; deity: string | null }>;
    };
    const byId = new Map(result.religions.map((r) => [r.i, r]));
    expect(byId.get(5)?.deity).toBeNull();
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findReligionsByTypeInPack(
        undefined,
        "Folk",
        DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.religions is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findReligionsByTypeInPack
    >[0];
    expect(
      findReligionsByTypeInPack(
        pack,
        "Folk",
        DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
      ),
    ).toBe("not-ready");
  });
});

describe("find_religions_by_type — tool surface", () => {
  it("returns ok=true with canonical type, religions, and count", async () => {
    const tool = createFindReligionsByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Folk" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("Folk");
    expect(new Set(body.religions.map((r: { i: number }) => r.i))).toEqual(
      new Set([1, 2, 8, 9, 10, 11]),
    );
    expect(body.count).toBe(6);
  });

  it("accepts type case-insensitively and echoes canonical casing", async () => {
    const tool = createFindReligionsByTypeTool(realRuntime());
    for (const variant of [
      "organized",
      "ORGANIZED",
      "Organized",
      " organized ",
    ]) {
      const result = await tool.execute({ type: variant });
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      expect(body.type).toBe("Organized");
      expect(new Set(body.religions.map((r: { i: number }) => r.i))).toEqual(
        new Set([3, 4]),
      );
    }
  });

  it("rejects missing / non-string / empty type", async () => {
    const tool = createFindReligionsByTypeTool(realRuntime());
    for (const bad of [
      {},
      { type: null },
      { type: "" },
      { type: "   " },
      { type: 42 },
      { type: true },
      { type: [] },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      const body = JSON.parse(r.content);
      expect(body.error).toMatch(/type/i);
      // Supported list is echoed for type-related errors.
      expect(Array.isArray(body.supported)).toBe(true);
    }
  });

  it("rejects unknown type with the supported list", async () => {
    const tool = createFindReligionsByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Pagan" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/unknown religion type/i);
    expect(body.supported).toEqual(
      expect.arrayContaining(["Folk", "Organized", "Cult", "Heresy"]),
    );
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindReligionsByTypeTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ type: "Folk" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("respects explicit limit and reports full count", async () => {
    const tool = createFindReligionsByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Folk", limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.religions.length).toBe(2);
    expect(body.count).toBe(6);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindReligionsByTypeTool(realRuntime());
    for (const bad of [
      { type: "Folk", limit: 0 },
      { type: "Folk", limit: -1 },
      { type: "Folk", limit: 1.5 },
      { type: "Folk", limit: "10" },
      { type: "Folk", limit: MAX_FIND_RELIGIONS_BY_TYPE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindReligionsByTypeRuntime = {
      find: (_type, limit) => {
        receivedLimit = limit;
        return { type: "Folk", religions: [], count: 0 };
      },
    };
    const tool = createFindReligionsByTypeTool(runtime);
    await tool.execute({ type: "Folk" });
    expect(receivedLimit).toBe(DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT);
  });

  it("accepts limit at the boundaries (1 and MAX)", async () => {
    const tool = createFindReligionsByTypeTool(realRuntime());
    const r1 = await tool.execute({ type: "Folk", limit: 1 });
    expect(r1.isError).toBeFalsy();
    const b1 = JSON.parse(r1.content);
    expect(b1.religions.length).toBe(1);
    expect(b1.count).toBe(6);
    const r2 = await tool.execute({
      type: "Folk",
      limit: MAX_FIND_RELIGIONS_BY_TYPE_LIMIT,
    });
    expect(r2.isError).toBeFalsy();
    expect(JSON.parse(r2.content).religions.length).toBe(6);
  });

  it("returns empty list when no religion matches the type", async () => {
    const tool = createFindReligionsByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Heresy" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("Heresy");
    expect(body.religions).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("is exported as findReligionsByTypeTool with the expected schema", () => {
    expect(findReligionsByTypeTool.name).toBe("find_religions_by_type");
    expect(findReligionsByTypeTool.input_schema.type).toBe("object");
    expect(findReligionsByTypeTool.input_schema.required).toEqual(["type"]);
    expect(findReligionsByTypeTool.input_schema.properties.type).toBeDefined();
    expect(findReligionsByTypeTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT).toBe(10000);
    expect(MAX_FIND_RELIGIONS_BY_TYPE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindReligionsByTypeRuntime integration -----

describe("defaultFindReligionsByTypeRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("finds religions via the default runtime for Folk", () => {
    const result = defaultFindReligionsByTypeRuntime.find(
      "Folk",
      DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
    ) as { religions: Array<{ i: number }>; count: number };
    expect(new Set(result.religions.map((r) => r.i))).toEqual(
      new Set([1, 2, 8, 9, 10, 11]),
    );
    expect(result.count).toBe(6);
  });

  it("tool uses default runtime end-to-end", async () => {
    const result = await findReligionsByTypeTool.execute({ type: "Organized" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("Organized");
    expect(new Set(body.religions.map((r: { i: number }) => r.i))).toEqual(
      new Set([3, 4]),
    );
    expect(body.count).toBe(2);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindReligionsByTypeRuntime.find(
        "Folk",
        DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findReligionsByTypeTool.execute({ type: "Folk" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
