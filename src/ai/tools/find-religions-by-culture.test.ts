import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindReligionsByCultureTool,
  DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT,
  defaultFindReligionsByCultureRuntime,
  type FindReligionsByCultureResult,
  type FindReligionsByCultureRuntime,
  findReligionsByCultureInPack,
  findReligionsByCultureTool,
  MAX_FIND_RELIGIONS_BY_CULTURE_LIMIT,
  type ResolveCultureResult,
  resolveCultureRefInPack,
} from "./find-religions-by-culture";

interface FakePack {
  religions: Array<{
    i: number;
    name?: string;
    type?: string;
    form?: string;
    color?: string;
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
  return p as unknown as Parameters<typeof findReligionsByCultureInPack>[0];
}

function makePack(): FakePack {
  // Cultures:
  //   0: "Wildlands" (allowed target)
  //   1: "Highlanders"
  //   2: "Seafarers"
  //   3: "Ghost" (removed)
  //   4: "EmptyFolk" (no religions point here)
  //
  // Religions:
  //   0: "No religion" (always skipped; i===0)
  //   1: "Ashenfaith"  culture 1, full fields
  //   2: "Birchcreed"  culture 1, capital=... (no, religions don't have capitals),
  //                    missing optional fields → null fallbacks
  //   3: "Coldlight"   culture 2, deity set
  //   4: "Duskpath"    culture 1, deity=null explicitly
  //   5: "Earthsong"   culture 0 (Wildlands), full fields
  //   6: "Ghostflame"  culture 1, removed: true — skipped
  //   7: "Orphan"      no culture field → won't match any numeric
  return {
    religions: [
      { i: 0, name: "No religion", culture: 0 },
      {
        i: 1,
        name: "Ashenfaith",
        type: "Organized",
        form: "Monotheism",
        color: "#aabbcc",
        deity: "The Flame",
        culture: 1,
      },
      {
        i: 2,
        name: "Birchcreed",
        culture: 1,
      },
      {
        i: 3,
        name: "Coldlight",
        type: "Folk",
        form: "Polytheism",
        color: "#445566",
        deity: "Cold Mother",
        culture: 2,
      },
      {
        i: 4,
        name: "Duskpath",
        type: "Cult",
        form: "Dualism",
        color: "#778899",
        deity: null,
        culture: 1,
      },
      {
        i: 5,
        name: "Earthsong",
        type: "Folk",
        form: "Animism",
        color: "#112233",
        deity: "Earth Spirit",
        culture: 0,
      },
      {
        i: 6,
        name: "Ghostflame",
        type: "Heresy",
        culture: 1,
        removed: true,
      },
      { i: 7, name: "Orphan" },
    ],
    cultures: [
      { i: 0, name: "Wildlands" },
      { i: 1, name: "Highlanders" },
      { i: 2, name: "Seafarers" },
      { i: 3, name: "Ghost", removed: true },
      { i: 4, name: "EmptyFolk" },
    ],
  };
}

function runtimeReturning(opts: {
  resolve?: ResolveCultureResult;
  find?: FindReligionsByCultureResult;
}): FindReligionsByCultureRuntime {
  return {
    resolveCulture: () => opts.resolve ?? { i: 1, name: "Highlanders" },
    find: () => opts.find ?? { religions: [], count: 0 },
  };
}

function realRuntime(): FindReligionsByCultureRuntime {
  const pack = asPack(makePack());
  return {
    resolveCulture: (ref) => resolveCultureRefInPack(pack, ref),
    find: (cultureI, limit) =>
      findReligionsByCultureInPack(pack, cultureI, limit),
  };
}

describe("find_religions_by_culture — pure scanner", () => {
  it("returns every active religion for a culture with multiple religions", () => {
    const result = findReligionsByCultureInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT,
    ) as {
      religions: Array<{ i: number; name: string }>;
      count: number;
    };
    const ids = new Set(result.religions.map((r) => r.i));
    // culture 1 religions: 1, 2, 4 (6 is removed)
    expect(ids).toEqual(new Set([1, 2, 4]));
    expect(result.count).toBe(3);
  });

  it("returns religions for a second culture cleanly (no cross-contamination)", () => {
    const result = findReligionsByCultureInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT,
    ) as { religions: Array<{ i: number }>; count: number };
    const ids = new Set(result.religions.map((r) => r.i));
    expect(ids).toEqual(new Set([3]));
    expect(result.count).toBe(1);
  });

  it("returns Wildlands (culture 0) religions and still skips 'No religion' (religion 0)", () => {
    const result = findReligionsByCultureInPack(
      asPack(makePack()),
      0,
      DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT,
    ) as {
      religions: Array<{ i: number }>;
      count: number;
    };
    const ids = new Set(result.religions.map((r) => r.i));
    // religion 5 has culture 0; religion 0 must be skipped even though it has culture 0
    expect(ids).toEqual(new Set([5]));
    expect(ids.has(0)).toBe(false);
    expect(result.count).toBe(1);
  });

  it("returns empty list when the culture has no religions", () => {
    // culture 4 (EmptyFolk) exists in fixture but no religion points to it.
    const result = findReligionsByCultureInPack(
      asPack(makePack()),
      4,
      DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT,
    ) as { religions: unknown[]; count: number };
    expect(result.religions).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("skips i=0 'No religion' and removed religions", () => {
    const result = findReligionsByCultureInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT,
    ) as { religions: Array<{ i: number }>; count: number };
    const ids = new Set(result.religions.map((r) => r.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(6)).toBe(false); // removed
  });

  it("truncates `religions` at limit but preserves full `count`", () => {
    const result = findReligionsByCultureInPack(asPack(makePack()), 1, 2) as {
      religions: Array<{ i: number }>;
      count: number;
    };
    expect(result.religions.length).toBe(2);
    expect(result.count).toBe(3);
  });

  it("populates name, type, form, color, deity fields", () => {
    const result = findReligionsByCultureInPack(
      asPack(makePack()),
      2,
      DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT,
    ) as {
      religions: Array<{
        i: number;
        name: string;
        type: string | null;
        form: string | null;
        color: string | null;
        deity: string | null;
      }>;
    };
    const byId = new Map(result.religions.map((r) => [r.i, r]));
    expect(byId.get(3)).toEqual({
      i: 3,
      name: "Coldlight",
      type: "Folk",
      form: "Polytheism",
      color: "#445566",
      deity: "Cold Mother",
    });
  });

  it("falls back to null for missing type / form / color / deity", () => {
    const result = findReligionsByCultureInPack(
      asPack(makePack()),
      1,
      DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT,
    ) as {
      religions: Array<{
        i: number;
        type: string | null;
        form: string | null;
        color: string | null;
        deity: string | null;
      }>;
    };
    const byId = new Map(result.religions.map((r) => [r.i, r]));
    // religion 2 "Birchcreed" has none of these in the fixture
    expect(byId.get(2)?.type).toBeNull();
    expect(byId.get(2)?.form).toBeNull();
    expect(byId.get(2)?.color).toBeNull();
    expect(byId.get(2)?.deity).toBeNull();
    // religion 4 "Duskpath" has deity: null explicitly
    expect(byId.get(4)?.deity).toBeNull();
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findReligionsByCultureInPack(
        undefined,
        1,
        DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.religions is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findReligionsByCultureInPack
    >[0];
    expect(
      findReligionsByCultureInPack(
        pack,
        1,
        DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT,
      ),
    ).toBe("not-ready");
  });
});

describe("resolveCultureRefInPack (find-religions-by-culture)", () => {
  it("resolves numeric id", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), 1)).toEqual({
      i: 1,
      name: "Highlanders",
    });
  });

  it("resolves case-insensitive name", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), "highlanders")).toEqual({
      i: 1,
      name: "Highlanders",
    });
  });

  it("allows numeric 0 (Wildlands)", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), 0)).toEqual({
      i: 0,
      name: "Wildlands",
    });
  });

  it("returns 'not-found' for unknown name", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), "nowhere")).toBe(
      "not-found",
    );
  });

  it("returns 'not-found' for removed culture by id", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), 3)).toBe("not-found");
  });

  it("returns 'not-found' for out-of-range id", () => {
    expect(resolveCultureRefInPack(asPack(makePack()), 99)).toBe("not-found");
  });

  it("returns 'not-ready' when cultures missing", () => {
    const pack = {} as unknown as Parameters<typeof resolveCultureRefInPack>[0];
    expect(resolveCultureRefInPack(pack, 1)).toBe("not-ready");
  });
});

describe("find_religions_by_culture — tool surface", () => {
  it("returns ok=true with resolved culture, religions, and count (numeric)", async () => {
    const tool = createFindReligionsByCultureTool(realRuntime());
    const result = await tool.execute({ culture: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.culture).toEqual({ i: 1, name: "Highlanders" });
    expect(new Set(body.religions.map((r: { i: number }) => r.i))).toEqual(
      new Set([1, 2, 4]),
    );
    expect(body.count).toBe(3);
  });

  it("accepts a string culture name (case-insensitive)", async () => {
    const tool = createFindReligionsByCultureTool(realRuntime());
    const result = await tool.execute({ culture: "seafarers" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.culture).toEqual({ i: 2, name: "Seafarers" });
    expect(new Set(body.religions.map((r: { i: number }) => r.i))).toEqual(
      new Set([3]),
    );
    expect(body.count).toBe(1);
  });

  it("accepts culture 0 (Wildlands)", async () => {
    const tool = createFindReligionsByCultureTool(realRuntime());
    const result = await tool.execute({ culture: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.culture).toEqual({ i: 0, name: "Wildlands" });
    expect(new Set(body.religions.map((r: { i: number }) => r.i))).toEqual(
      new Set([5]),
    );
    expect(body.count).toBe(1);
  });

  it("rejects missing / invalid culture", async () => {
    const tool = createFindReligionsByCultureTool(realRuntime());
    for (const bad of [
      {},
      { culture: null },
      { culture: "" },
      { culture: "   " },
      { culture: -1 },
      { culture: 1.5 },
      { culture: true },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /culture must be a non-negative integer id or a non-empty name string/i,
      );
    }
  });

  it("surfaces 'not-found' as a structured error", async () => {
    const tool = createFindReligionsByCultureTool(realRuntime());
    const result = await tool.execute({ culture: "nowhere" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no culture found/i);
  });

  it("surfaces 'not-ready' from resolveCulture as a structured error", async () => {
    const tool = createFindReligionsByCultureTool(
      runtimeReturning({ resolve: "not-ready" }),
    );
    const result = await tool.execute({ culture: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces 'not-ready' from find as a structured error", async () => {
    const tool = createFindReligionsByCultureTool(
      runtimeReturning({
        resolve: { i: 1, name: "Highlanders" },
        find: "not-ready",
      }),
    );
    const result = await tool.execute({ culture: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("rejects culture removed (resolves to not-found)", async () => {
    const tool = createFindReligionsByCultureTool(realRuntime());
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no culture found/i);
  });

  it("respects explicit limit and reports full count", async () => {
    const tool = createFindReligionsByCultureTool(realRuntime());
    const result = await tool.execute({ culture: 1, limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.religions.length).toBe(2);
    expect(body.count).toBe(3);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindReligionsByCultureTool(realRuntime());
    for (const bad of [
      { culture: 1, limit: 0 },
      { culture: 1, limit: -1 },
      { culture: 1, limit: 1.5 },
      { culture: 1, limit: "10" },
      { culture: 1, limit: MAX_FIND_RELIGIONS_BY_CULTURE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindReligionsByCultureRuntime = {
      resolveCulture: () => ({ i: 1, name: "Highlanders" }),
      find: (_cultureI, limit) => {
        receivedLimit = limit;
        return { religions: [], count: 0 };
      },
    };
    const tool = createFindReligionsByCultureTool(runtime);
    await tool.execute({ culture: 1 });
    expect(receivedLimit).toBe(DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT);
  });

  it("returns empty list when the culture has no religions", async () => {
    const runtime: FindReligionsByCultureRuntime = {
      resolveCulture: () => ({ i: 4, name: "EmptyFolk" }),
      find: () => ({ religions: [], count: 0 }),
    };
    const tool = createFindReligionsByCultureTool(runtime);
    const result = await tool.execute({ culture: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.culture).toEqual({ i: 4, name: "EmptyFolk" });
    expect(body.religions).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("is exported as findReligionsByCultureTool with the expected schema", () => {
    expect(findReligionsByCultureTool.name).toBe("find_religions_by_culture");
    expect(findReligionsByCultureTool.input_schema.type).toBe("object");
    expect(findReligionsByCultureTool.input_schema.required).toEqual([
      "culture",
    ]);
    expect(
      findReligionsByCultureTool.input_schema.properties.culture,
    ).toBeDefined();
    expect(
      findReligionsByCultureTool.input_schema.properties.limit,
    ).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT).toBe(10000);
    expect(MAX_FIND_RELIGIONS_BY_CULTURE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindReligionsByCultureRuntime integration -----

describe("defaultFindReligionsByCultureRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("resolves a culture via the default runtime", () => {
    expect(
      defaultFindReligionsByCultureRuntime.resolveCulture("Highlanders"),
    ).toEqual({
      i: 1,
      name: "Highlanders",
    });
  });

  it("finds religions via the default runtime for culture 1", () => {
    const result = defaultFindReligionsByCultureRuntime.find(
      1,
      DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT,
    ) as { religions: Array<{ i: number }>; count: number };
    expect(new Set(result.religions.map((r) => r.i))).toEqual(
      new Set([1, 2, 4]),
    );
    expect(result.count).toBe(3);
  });

  it("tool uses default runtime end-to-end", async () => {
    const result = await findReligionsByCultureTool.execute({
      culture: "Seafarers",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.culture).toEqual({ i: 2, name: "Seafarers" });
    expect(new Set(body.religions.map((r: { i: number }) => r.i))).toEqual(
      new Set([3]),
    );
    expect(body.count).toBe(1);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindReligionsByCultureRuntime.resolveCulture(1)).toBe(
      "not-ready",
    );
    expect(
      defaultFindReligionsByCultureRuntime.find(
        1,
        DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findReligionsByCultureTool.execute({ culture: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
