import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindDuplicateNamesTool,
  DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
  DUPLICATE_NAME_DOMAINS,
  type DuplicateNameDomain,
  defaultFindDuplicateNamesRuntime,
  type FindDuplicateNamesResult,
  type FindDuplicateNamesRuntime,
  findDuplicateNamesInPack,
  findDuplicateNamesTool,
  MAX_FIND_DUPLICATE_NAMES_LIMIT,
} from "./find-duplicate-names";

interface FakePack {
  states?: Array<{ i: number; name?: string; removed?: boolean } | undefined>;
  provinces?: Array<
    { i: number; name?: string; removed?: boolean } | undefined
  >;
  burgs?: Array<{ i: number; name?: string; removed?: boolean } | undefined>;
  cultures?: Array<{ i: number; name?: string; removed?: boolean } | undefined>;
  religions?: Array<
    { i: number; name?: string; removed?: boolean } | undefined
  >;
  rivers?: Array<{ i: number; name?: string; removed?: boolean } | undefined>;
}

function asPack(p: FakePack | undefined) {
  return p as unknown as Parameters<typeof findDuplicateNamesInPack>[0];
}

function makePack(): FakePack {
  return {
    // 6 states: 0 placeholder, 1 removed 'Stormreach', 3 & 5 share "Stormreach",
    // 7 & 9 share "Altaria" (case varies), 11 has empty name (ignored).
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Stormreach", removed: true },
      undefined,
      { i: 3, name: "Stormreach" },
      undefined,
      { i: 5, name: "STORMREACH" },
      undefined,
      { i: 7, name: "Altaria" },
      undefined,
      { i: 9, name: "altaria" },
      undefined,
      { i: 11, name: "   " },
      { i: 12, name: "Unique" },
    ],
    // 2 provinces share "Eastmark"
    provinces: [
      { i: 0, name: "PH" },
      { i: 1, name: "Eastmark" },
      { i: 2, name: "Westmark" },
      { i: 3, name: "eastmark" },
    ],
    // burgs: 'Bay' twice
    burgs: [
      { i: 0, name: "PH" },
      { i: 1, name: "Bay" },
      { i: 2, name: "Bay" },
      { i: 3, name: "Harbor" },
    ],
    // cultures: no duplicates
    cultures: [
      { i: 0, name: "Wildlands" },
      { i: 1, name: "Highlanders" },
      { i: 2, name: "Marshfolk" },
    ],
    // religions: three-way duplicate
    religions: [
      { i: 0, name: "None" },
      { i: 1, name: "Cult" },
      { i: 2, name: "cult" },
      { i: 3, name: "CULT" },
      { i: 4, name: "Solitaire" },
    ],
    // rivers: one duplicate pair
    rivers: [
      { i: 0, name: "" },
      { i: 1, name: "Serpent" },
      { i: 2, name: "Gold" },
      { i: 3, name: "serpent" },
    ],
  };
}

function runtimeReturning(
  result: FindDuplicateNamesResult,
): FindDuplicateNamesRuntime {
  return { collect: () => result };
}

function realRuntime(): FindDuplicateNamesRuntime {
  const pack = asPack(makePack());
  return {
    collect: (domain, limit) => findDuplicateNamesInPack(pack, domain, limit),
  };
}

describe("find_duplicate_names — pure scanner", () => {
  it("returns duplicate state groups (case-insensitive)", () => {
    const result = findDuplicateNamesInPack(
      asPack(makePack()),
      "state",
      DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
    );
    expect(result).toMatchObject({ domain: "state", count: 2 });
    if (typeof result !== "object") throw new Error("expected payload");
    const names = result.duplicates.map((d) => d.name.toLowerCase()).sort();
    expect(names).toEqual(["altaria", "stormreach"]);
    const stormreach = result.duplicates.find(
      (d) => d.name.toLowerCase() === "stormreach",
    );
    expect(stormreach?.ids).toEqual([3, 5]);
    const altaria = result.duplicates.find(
      (d) => d.name.toLowerCase() === "altaria",
    );
    expect(altaria?.ids).toEqual([7, 9]);
  });

  it("skips index-0 placeholder and removed entries", () => {
    const result = findDuplicateNamesInPack(
      asPack(makePack()),
      "state",
      DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
    );
    if (typeof result !== "object") throw new Error("expected payload");
    // The removed 'Stormreach' (i=1) must not appear in any ids list.
    const all = result.duplicates.flatMap((d) => d.ids);
    expect(all).not.toContain(0);
    expect(all).not.toContain(1);
  });

  it("skips entries with empty / whitespace names", () => {
    const pack: FakePack = {
      states: [
        { i: 0, name: "PH" },
        { i: 1, name: "" },
        { i: 2, name: "   " },
        { i: 3, name: "A" },
        { i: 4, name: "A" },
      ],
    };
    const result = findDuplicateNamesInPack(
      asPack(pack),
      "state",
      DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
    );
    if (typeof result !== "object") throw new Error("expected payload");
    // No group of empty-name entries, only the "A" group.
    expect(result.count).toBe(1);
    expect(result.duplicates[0]).toMatchObject({
      name: "A",
      ids: [3, 4],
      count: 2,
    });
  });

  it("drops groups of size 1 (unique names)", () => {
    const result = findDuplicateNamesInPack(
      asPack(makePack()),
      "culture",
      DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
    );
    expect(result).toMatchObject({
      domain: "culture",
      duplicates: [],
      count: 0,
    });
  });

  it("sorts groups by count desc then lowercased name asc", () => {
    const pack: FakePack = {
      states: [
        { i: 0, name: "PH" },
        { i: 1, name: "Zed" },
        { i: 2, name: "Zed" },
        { i: 3, name: "Alpha" },
        { i: 4, name: "Alpha" },
        { i: 5, name: "alpha" },
        { i: 6, name: "beta" },
        { i: 7, name: "BETA" },
      ],
    };
    const result = findDuplicateNamesInPack(
      asPack(pack),
      "state",
      DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
    );
    if (typeof result !== "object") throw new Error("expected payload");
    // Alpha has 3, then beta (2) vs Zed (2) — alphabetical tiebreak.
    const seq = result.duplicates.map((d) => d.name.toLowerCase());
    expect(seq).toEqual(["alpha", "beta", "zed"]);
    expect(result.duplicates[0].count).toBe(3);
    expect(result.duplicates[1].count).toBe(2);
    expect(result.duplicates[2].count).toBe(2);
  });

  it("uses the first-encountered original-case name for the group label", () => {
    const pack: FakePack = {
      states: [
        { i: 0, name: "PH" },
        { i: 1, name: "StormReach" },
        { i: 2, name: "STORMREACH" },
        { i: 3, name: "stormreach" },
      ],
    };
    const result = findDuplicateNamesInPack(
      asPack(pack),
      "state",
      DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
    );
    if (typeof result !== "object") throw new Error("expected payload");
    expect(result.duplicates[0].name).toBe("StormReach");
    expect(result.duplicates[0].ids).toEqual([1, 2, 3]);
  });

  it("truncates duplicates at limit but preserves full count", () => {
    const result = findDuplicateNamesInPack(asPack(makePack()), "state", 1);
    if (typeof result !== "object") throw new Error("expected payload");
    expect(result.count).toBe(2);
    expect(result.duplicates).toHaveLength(1);
  });

  it("finds duplicates in each supported domain", () => {
    const pack = asPack(makePack());
    const byDomain: Record<DuplicateNameDomain, number> = {
      state: 2,
      province: 1,
      burg: 1,
      culture: 0,
      religion: 1,
      river: 1,
    };
    for (const domain of DUPLICATE_NAME_DOMAINS) {
      const result = findDuplicateNamesInPack(
        pack,
        domain,
        DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
      );
      expect(result).toMatchObject({ domain, count: byDomain[domain] });
    }
  });

  it("returns 'not-ready' when pack is undefined", () => {
    expect(
      findDuplicateNamesInPack(
        undefined,
        "state",
        DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when the domain's collection is missing", () => {
    const pack: FakePack = { states: [] }; // rivers intentionally absent
    expect(
      findDuplicateNamesInPack(
        asPack(pack),
        "river",
        DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("religions three-way group reports all ids ascending", () => {
    const result = findDuplicateNamesInPack(
      asPack(makePack()),
      "religion",
      DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
    );
    if (typeof result !== "object") throw new Error("expected payload");
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].ids).toEqual([1, 2, 3]);
    expect(result.duplicates[0].count).toBe(3);
  });
});

describe("find_duplicate_names — tool surface", () => {
  it("returns ok=true with the expected shape", async () => {
    const tool = createFindDuplicateNamesTool(realRuntime());
    const result = await tool.execute({ domain: "burg" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      domain: "burg",
      duplicates: [{ name: "Bay", ids: [1, 2], count: 2 }],
      count: 1,
    });
  });

  it("accepts domain case-insensitively", async () => {
    const tool = createFindDuplicateNamesTool(realRuntime());
    for (const d of [
      "STATE",
      "Province",
      "Burg",
      "cUlTuRe",
      "RELIGION",
      "River",
    ]) {
      const r = await tool.execute({ domain: d });
      expect(r.isError).toBeFalsy();
      expect(JSON.parse(r.content).ok).toBe(true);
    }
  });

  it("rejects unknown / empty / non-string domain", async () => {
    const tool = createFindDuplicateNamesTool(realRuntime());
    for (const bad of [
      { domain: "marker" },
      { domain: "route" },
      { domain: "" },
      { domain: "   " },
      { domain: 7 },
      { domain: null },
      {},
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/domain must be one of/);
    }
  });

  it("rejects invalid limit", async () => {
    const tool = createFindDuplicateNamesTool(realRuntime());
    for (const bad of [
      { domain: "state", limit: 0 },
      { domain: "state", limit: -1 },
      { domain: "state", limit: 1.5 },
      { domain: "state", limit: "10" },
      { domain: "state", limit: MAX_FIND_DUPLICATE_NAMES_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("applies default limit when omitted", async () => {
    let receivedLimit = -1;
    const runtime: FindDuplicateNamesRuntime = {
      collect: (domain, limit) => {
        receivedLimit = limit;
        return { domain, duplicates: [], count: 0 };
      },
    };
    const tool = createFindDuplicateNamesTool(runtime);
    await tool.execute({ domain: "state" });
    expect(receivedLimit).toBe(DEFAULT_FIND_DUPLICATE_NAMES_LIMIT);
  });

  it("respects explicit limit and still reports full count", async () => {
    const runtime: FindDuplicateNamesRuntime = {
      collect: (domain) => ({
        domain,
        duplicates: [{ name: "A", ids: [1, 2], count: 2 }],
        count: 5,
      }),
    };
    const tool = createFindDuplicateNamesTool(runtime);
    const r = await tool.execute({ domain: "state", limit: 1 });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.duplicates).toHaveLength(1);
    expect(body.count).toBe(5);
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindDuplicateNamesTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ domain: "state" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("is exported as findDuplicateNamesTool with expected schema", () => {
    expect(findDuplicateNamesTool.name).toBe("find_duplicate_names");
    expect(findDuplicateNamesTool.input_schema.type).toBe("object");
    expect(findDuplicateNamesTool.input_schema.required).toEqual(["domain"]);
    expect(findDuplicateNamesTool.input_schema.properties.domain).toBeDefined();
    expect(findDuplicateNamesTool.input_schema.properties.limit).toBeDefined();
    expect(DUPLICATE_NAME_DOMAINS).toEqual([
      "state",
      "province",
      "burg",
      "culture",
      "religion",
      "river",
    ]);
  });
});

describe("defaultFindDuplicateNamesRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via the default runtime (state)", () => {
    const result = defaultFindDuplicateNamesRuntime.collect(
      "state",
      DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
    );
    expect(result).toMatchObject({ domain: "state", count: 2 });
  });

  it("reads real pack via the default runtime (province)", () => {
    const result = defaultFindDuplicateNamesRuntime.collect(
      "province",
      DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
    );
    expect(result).toMatchObject({ domain: "province", count: 1 });
  });

  it("reads real pack via the default runtime (burg)", () => {
    const result = defaultFindDuplicateNamesRuntime.collect(
      "burg",
      DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
    );
    expect(result).toMatchObject({
      domain: "burg",
      duplicates: [{ name: "Bay", ids: [1, 2], count: 2 }],
      count: 1,
    });
  });

  it("reads real pack via the default runtime (religion)", () => {
    const result = defaultFindDuplicateNamesRuntime.collect(
      "religion",
      DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
    );
    expect(result).toMatchObject({ domain: "religion", count: 1 });
  });

  it("reads real pack via the default runtime (river)", () => {
    const result = defaultFindDuplicateNamesRuntime.collect(
      "river",
      DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
    );
    expect(result).toMatchObject({ domain: "river", count: 1 });
  });

  it("tool uses default runtime to resolve against globalThis.pack", async () => {
    const result = await findDuplicateNamesTool.execute({ domain: "state" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({ ok: true, domain: "state", count: 2 });
  });

  it("returns 'not-ready' when pack is missing -> tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindDuplicateNamesRuntime.collect(
        "state",
        DEFAULT_FIND_DUPLICATE_NAMES_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findDuplicateNamesTool.execute({ domain: "state" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
