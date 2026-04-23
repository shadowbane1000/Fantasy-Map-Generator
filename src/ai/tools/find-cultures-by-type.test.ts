import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindCulturesByTypeTool,
  DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT,
  defaultFindCulturesByTypeRuntime,
  type FindCulturesByTypeResult,
  type FindCulturesByTypeRuntime,
  findCulturesByTypeInPack,
  findCulturesByTypeTool,
  MAX_FIND_CULTURES_BY_TYPE_LIMIT,
} from "./find-cultures-by-type";

interface FakePack {
  cultures: Array<{
    i: number;
    name?: string;
    color?: string;
    type?: string;
    expansionism?: number;
    base?: number;
    center?: number;
    removed?: boolean;
  }>;
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findCulturesByTypeInPack>[0];
}

function makePack(): FakePack {
  // Cultures:
  //   0: "Wildlands" (type "" — explicit empty)
  //   1: "Highlanders" type "Highland"
  //   2: "Seafarers"   type "Naval"
  //   3: "Skylanders"  type "highland" (lowercase, still matches Highland)
  //   4: "Duststriders" type "Nomadic"
  //   5: "Lakedwellers" type "Naval" (removed — skipped)
  //   6: "Orphan"       no type field (skipped)
  //   7: "CustomType"   type "Frontier" (non-canonical, but accepted)
  //   8: "Thirdhighland" type "Highland"
  return {
    cultures: [
      { i: 0, name: "Wildlands", type: "" },
      {
        i: 1,
        name: "Highlanders",
        color: "#aabbcc",
        type: "Highland",
        expansionism: 1.5,
        base: 2,
        center: 100,
      },
      {
        i: 2,
        name: "Seafarers",
        color: "#112233",
        type: "Naval",
        expansionism: 2.0,
        base: 5,
        center: 200,
      },
      {
        i: 3,
        name: "Skylanders",
        color: "#445566",
        type: "highland",
        expansionism: 1.1,
        base: 2,
        center: 300,
      },
      {
        i: 4,
        name: "Duststriders",
        color: "#778899",
        type: "Nomadic",
        expansionism: 0.9,
        base: 10,
        center: 400,
      },
      {
        i: 5,
        name: "Lakedwellers",
        color: "#abcabc",
        type: "Naval",
        removed: true,
      },
      { i: 6, name: "Orphan" },
      {
        i: 7,
        name: "CustomType",
        color: "#ffeedd",
        type: "Frontier",
        expansionism: 1.0,
        base: 3,
        center: 500,
      },
      {
        i: 8,
        name: "Thirdhighland",
        type: "Highland",
      },
    ],
  };
}

function runtimeReturning(
  result: FindCulturesByTypeResult,
): FindCulturesByTypeRuntime {
  return { find: () => result };
}

function realRuntime(): FindCulturesByTypeRuntime {
  const pack = asPack(makePack());
  return {
    find: (type, limit) => findCulturesByTypeInPack(pack, type, limit),
  };
}

describe("find_cultures_by_type — pure scanner", () => {
  it("matches cultures by type case-insensitively (Highland)", () => {
    const result = findCulturesByTypeInPack(
      asPack(makePack()),
      "Highland",
      DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT,
    ) as {
      type: string;
      cultures: Array<{ i: number }>;
      count: number;
    };
    const ids = new Set(result.cultures.map((c) => c.i));
    // Highland cultures: 1 ("Highland"), 3 ("highland"), 8 ("Highland")
    expect(ids).toEqual(new Set([1, 3, 8]));
    expect(result.count).toBe(3);
    expect(result.type).toBe("Highland");
  });

  it("returns cultures for a second type cleanly (no cross-contamination)", () => {
    const result = findCulturesByTypeInPack(
      asPack(makePack()),
      "Naval",
      DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT,
    ) as { cultures: Array<{ i: number }>; count: number };
    const ids = new Set(result.cultures.map((c) => c.i));
    // Naval: 2 (5 is removed)
    expect(ids).toEqual(new Set([2]));
    expect(result.count).toBe(1);
  });

  it("allows culture 0 (Wildlands) when its type matches the caller input", () => {
    // Wildlands has type "". A caller-supplied "" is rejected at the
    // tool-surface layer (empty after trim), but the pure scanner honours it.
    const result = findCulturesByTypeInPack(
      asPack(makePack()),
      "",
      DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT,
    ) as { cultures: Array<{ i: number }>; count: number };
    const ids = new Set(result.cultures.map((c) => c.i));
    // Only culture 0 has type "". 6 has no type field at all (skipped).
    expect(ids).toEqual(new Set([0]));
    expect(result.count).toBe(1);
  });

  it("returns empty list when no culture has the given type", () => {
    const result = findCulturesByTypeInPack(
      asPack(makePack()),
      "Hunting",
      DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT,
    ) as { cultures: unknown[]; count: number };
    expect(result.cultures).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("skips removed cultures and cultures with no type field", () => {
    // Naval has two candidates: 2 and 5 — 5 is removed.
    const result = findCulturesByTypeInPack(
      asPack(makePack()),
      "Naval",
      DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT,
    ) as { cultures: Array<{ i: number }>; count: number };
    const ids = new Set(result.cultures.map((c) => c.i));
    expect(ids.has(5)).toBe(false); // removed
    expect(ids.has(6)).toBe(false); // no type
    expect(ids.has(2)).toBe(true);
  });

  it("accepts arbitrary (non-canonical) type strings", () => {
    const result = findCulturesByTypeInPack(
      asPack(makePack()),
      "Frontier",
      DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT,
    ) as { cultures: Array<{ i: number }>; count: number };
    const ids = new Set(result.cultures.map((c) => c.i));
    expect(ids).toEqual(new Set([7]));
    expect(result.count).toBe(1);
  });

  it("truncates `cultures` at limit but preserves full `count`", () => {
    const result = findCulturesByTypeInPack(
      asPack(makePack()),
      "Highland",
      2,
    ) as { cultures: Array<{ i: number }>; count: number };
    expect(result.cultures.length).toBe(2);
    expect(result.count).toBe(3);
  });

  it("populates name, color, expansionism, base, center from the raw culture", () => {
    const result = findCulturesByTypeInPack(
      asPack(makePack()),
      "Naval",
      DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT,
    ) as {
      cultures: Array<{
        i: number;
        name: string;
        color: string | null;
        expansionism: number | null;
        base: number | null;
        center: number | null;
      }>;
    };
    const byId = new Map(result.cultures.map((c) => [c.i, c]));
    expect(byId.get(2)).toEqual({
      i: 2,
      name: "Seafarers",
      color: "#112233",
      expansionism: 2.0,
      base: 5,
      center: 200,
    });
  });

  it("falls back to null for missing color / expansionism / base / center", () => {
    const result = findCulturesByTypeInPack(
      asPack(makePack()),
      "Highland",
      DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT,
    ) as {
      cultures: Array<{
        i: number;
        color: string | null;
        expansionism: number | null;
        base: number | null;
        center: number | null;
      }>;
    };
    const byId = new Map(result.cultures.map((c) => [c.i, c]));
    // culture 8 "Thirdhighland" has only name + type
    expect(byId.get(8)?.color).toBeNull();
    expect(byId.get(8)?.expansionism).toBeNull();
    expect(byId.get(8)?.base).toBeNull();
    expect(byId.get(8)?.center).toBeNull();
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findCulturesByTypeInPack(
        undefined,
        "Highland",
        DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cultures is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findCulturesByTypeInPack
    >[0];
    expect(
      findCulturesByTypeInPack(
        pack,
        "Highland",
        DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT,
      ),
    ).toBe("not-ready");
  });
});

describe("find_cultures_by_type — tool surface", () => {
  it("returns ok=true with type, cultures, and count", async () => {
    const tool = createFindCulturesByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Highland" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("Highland");
    expect(new Set(body.cultures.map((c: { i: number }) => c.i))).toEqual(
      new Set([1, 3, 8]),
    );
    expect(body.count).toBe(3);
  });

  it("accepts type case-insensitively and with surrounding whitespace", async () => {
    const tool = createFindCulturesByTypeTool(realRuntime());
    for (const variant of ["highland", "HIGHLAND", "Highland", " highland "]) {
      const result = await tool.execute({ type: variant });
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      // The echoed type is the trimmed caller input — not canonical.
      expect(body.type).toBe(variant.trim());
      expect(new Set(body.cultures.map((c: { i: number }) => c.i))).toEqual(
        new Set([1, 3, 8]),
      );
    }
  });

  it("accepts arbitrary non-canonical type strings (no enum validation)", async () => {
    const tool = createFindCulturesByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Frontier" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.type).toBe("Frontier");
    expect(new Set(body.cultures.map((c: { i: number }) => c.i))).toEqual(
      new Set([7]),
    );
    expect(body.count).toBe(1);
  });

  it("rejects missing / non-string / empty / whitespace type", async () => {
    const tool = createFindCulturesByTypeTool(realRuntime());
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

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindCulturesByTypeTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ type: "Highland" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("respects explicit limit and reports full count", async () => {
    const tool = createFindCulturesByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Highland", limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.cultures.length).toBe(2);
    expect(body.count).toBe(3);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindCulturesByTypeTool(realRuntime());
    for (const bad of [
      { type: "Highland", limit: 0 },
      { type: "Highland", limit: -1 },
      { type: "Highland", limit: 1.5 },
      { type: "Highland", limit: "10" },
      { type: "Highland", limit: MAX_FIND_CULTURES_BY_TYPE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindCulturesByTypeRuntime = {
      find: (_type, limit) => {
        receivedLimit = limit;
        return { type: "Highland", cultures: [], count: 0 };
      },
    };
    const tool = createFindCulturesByTypeTool(runtime);
    await tool.execute({ type: "Highland" });
    expect(receivedLimit).toBe(DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT);
  });

  it("accepts limit at the boundaries (1 and MAX)", async () => {
    const tool = createFindCulturesByTypeTool(realRuntime());
    const r1 = await tool.execute({ type: "Highland", limit: 1 });
    expect(r1.isError).toBeFalsy();
    const b1 = JSON.parse(r1.content);
    expect(b1.cultures.length).toBe(1);
    expect(b1.count).toBe(3);
    const r2 = await tool.execute({
      type: "Highland",
      limit: MAX_FIND_CULTURES_BY_TYPE_LIMIT,
    });
    expect(r2.isError).toBeFalsy();
    expect(JSON.parse(r2.content).cultures.length).toBe(3);
  });

  it("returns empty list when no culture matches the type", async () => {
    const tool = createFindCulturesByTypeTool(realRuntime());
    const result = await tool.execute({ type: "Hunting" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("Hunting");
    expect(body.cultures).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("is exported as findCulturesByTypeTool with the expected schema", () => {
    expect(findCulturesByTypeTool.name).toBe("find_cultures_by_type");
    expect(findCulturesByTypeTool.input_schema.type).toBe("object");
    expect(findCulturesByTypeTool.input_schema.required).toEqual(["type"]);
    expect(findCulturesByTypeTool.input_schema.properties.type).toBeDefined();
    expect(findCulturesByTypeTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT).toBe(10000);
    expect(MAX_FIND_CULTURES_BY_TYPE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindCulturesByTypeRuntime integration -----

describe("defaultFindCulturesByTypeRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("finds cultures via the default runtime for Highland", () => {
    const result = defaultFindCulturesByTypeRuntime.find(
      "Highland",
      DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT,
    ) as { cultures: Array<{ i: number }>; count: number };
    expect(new Set(result.cultures.map((c) => c.i))).toEqual(
      new Set([1, 3, 8]),
    );
    expect(result.count).toBe(3);
  });

  it("tool uses default runtime end-to-end", async () => {
    const result = await findCulturesByTypeTool.execute({ type: "Naval" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("Naval");
    expect(new Set(body.cultures.map((c: { i: number }) => c.i))).toEqual(
      new Set([2]),
    );
    expect(body.count).toBe(1);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindCulturesByTypeRuntime.find(
        "Highland",
        DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findCulturesByTypeTool.execute({ type: "Highland" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
