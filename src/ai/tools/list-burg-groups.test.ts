import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "./index";
import {
  type BurgGroup,
  type BurgGroupSummary,
  type BurgGroupsState,
  countBurgsForGroup,
  createListBurgGroupsTool,
  type ListBurgGroupsRuntime,
  listBurgGroupsTool,
  mapBurgGroup,
  readBurgGroupsFromState,
} from "./list-burg-groups";

function makeRuntime(state: BurgGroupsState): ListBurgGroupsRuntime {
  return { readState: () => state };
}

function parse(content: string): Record<string, unknown> {
  return JSON.parse(content) as Record<string, unknown>;
}

const cities: BurgGroup = {
  name: "cities",
  order: 1,
  preview: "watabou-city",
  min: 1000,
  max: 50000,
  percentile: 80,
  biomes: "5,6,7",
  states: "1,2",
  cultures: "1",
  religions: "1,2",
  features: { capital: true, port: true },
  active: true,
  isDefault: true,
};

const villages: BurgGroup = {
  name: "villages",
  order: 2,
  preview: "watabou-village",
  min: 0,
  max: 1000,
  active: true,
};

describe("list_burg_groups tool — happy path", () => {
  it("returns mapped groups with correct counts and field mappings", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({
        groups: [cities, villages],
        burgs: [
          { group: "cities" },
          { group: "cities" },
          { group: "villages" },
          { group: "cities", removed: true },
          { group: "wilderness" },
        ],
      }),
    );

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2);
    expect(body.total).toBe(2);

    const groups = body.groups as BurgGroupSummary[];
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({
      name: "cities",
      order: 1,
      preview: "watabou-city",
      min: 1000,
      max: 50000,
      percentile: 80,
      biomes: "5,6,7",
      states: "1,2",
      cultures: "1",
      religions: "1,2",
      features: { capital: true, port: true },
      active: true,
      is_default: true,
      burg_count: 2,
    });
    expect(groups[1]).toEqual({
      name: "villages",
      order: 2,
      preview: "watabou-village",
      min: 0,
      max: 1000,
      percentile: null,
      biomes: null,
      states: null,
      cultures: null,
      religions: null,
      features: {},
      active: true,
      is_default: false,
      burg_count: 1,
    });
  });
});

describe("list_burg_groups tool — value normalization", () => {
  it("preserves zero numeric values (does not collapse 0 to null)", async () => {
    // Editor coerces 0 to null on save, but we must not impose that
    // mapping during read — if a stored value is the number 0 we
    // surface it.
    const tool = createListBurgGroupsTool(
      makeRuntime({
        groups: [{ name: "g", min: 0, max: 0, percentile: 0, active: true }],
        burgs: [],
      }),
    );
    const body = parse((await tool.execute({})).content);
    const g = (body.groups as BurgGroupSummary[])[0];
    expect(g.min).toBe(0);
    expect(g.max).toBe(0);
    expect(g.percentile).toBe(0);
  });

  it("nullifies missing scalars and empty strings; defaults features to {}", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({
        groups: [
          {
            name: "sparse",
            preview: "",
            biomes: "",
            states: "",
            cultures: "",
            religions: "",
            // min/max/percentile/order all missing
            // features missing
            active: true,
          },
        ],
        burgs: [],
      }),
    );
    const body = parse((await tool.execute({})).content);
    const g = (body.groups as BurgGroupSummary[])[0];
    expect(g.preview).toBeNull();
    expect(g.biomes).toBeNull();
    expect(g.states).toBeNull();
    expect(g.cultures).toBeNull();
    expect(g.religions).toBeNull();
    expect(g.min).toBeNull();
    expect(g.max).toBeNull();
    expect(g.percentile).toBeNull();
    expect(g.order).toBeNull();
    expect(g.features).toEqual({});
  });

  it("rejects non-finite numbers (NaN/Infinity → null)", () => {
    const summary = mapBurgGroup(
      { name: "x", order: Number.NaN, min: Infinity },
      0,
    );
    expect(summary.order).toBeNull();
    expect(summary.min).toBeNull();
  });
});

describe("list_burg_groups tool — include_inactive filter", () => {
  const groupsWithInactive: BurgGroup[] = [
    { name: "a", active: true },
    { name: "b", active: false },
    { name: "c", active: true },
  ];

  it("default (include_inactive omitted) keeps inactive groups", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({ groups: groupsWithInactive, burgs: [] }),
    );
    const body = parse((await tool.execute({})).content);
    expect(body.count).toBe(3);
    expect(body.total).toBe(3);
    expect((body.groups as BurgGroupSummary[]).map((g) => g.name)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("include_inactive: true keeps inactive groups", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({ groups: groupsWithInactive, burgs: [] }),
    );
    const body = parse(
      (await tool.execute({ include_inactive: true })).content,
    );
    expect(body.count).toBe(3);
    expect(body.total).toBe(3);
  });

  it("include_inactive: false drops inactive groups but preserves order", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({ groups: groupsWithInactive, burgs: [] }),
    );
    const body = parse(
      (await tool.execute({ include_inactive: false })).content,
    );
    expect(body.count).toBe(2);
    expect(body.total).toBe(3);
    expect((body.groups as BurgGroupSummary[]).map((g) => g.name)).toEqual([
      "a",
      "c",
    ]);
  });

  it("treats missing `active` field as inactive (filtered out when include_inactive=false)", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({
        groups: [
          { name: "explicit_true", active: true },
          { name: "missing_active" }, // active undefined
        ],
        burgs: [],
      }),
    );
    const body = parse(
      (await tool.execute({ include_inactive: false })).content,
    );
    const names = (body.groups as BurgGroupSummary[]).map((g) => g.name);
    expect(names).toEqual(["explicit_true"]);
  });
});

describe("list_burg_groups tool — burg counting", () => {
  it("ignores burgs with removed:true", () => {
    expect(
      countBurgsForGroup(
        [
          { group: "g", removed: true },
          { group: "g" },
          { group: "g" },
          { group: "h" },
        ],
        "g",
      ),
    ).toBe(2);
  });

  it("returns 0 when burgs is undefined", () => {
    expect(countBurgsForGroup(undefined, "g")).toBe(0);
  });

  it("survives null/undefined burg slots in the array", () => {
    // Pack arrays often have a null/placeholder at index 0; the
    // counter must not crash.
    expect(
      countBurgsForGroup(
        [null, undefined, { group: "g" }] as unknown as Parameters<
          typeof countBurgsForGroup
        >[0],
        "g",
      ),
    ).toBe(1);
  });
});

describe("list_burg_groups tool — pack.burgs missing", () => {
  it("returns groups with burg_count: 0 plus a note", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({
        groups: [
          { name: "a", active: true },
          { name: "b", active: true },
        ],
        burgs: undefined,
      }),
    );
    const body = parse((await tool.execute({})).content);
    expect(body.ok).toBe(true);
    expect(body.pack_burgs_missing).toBe(true);
    expect(typeof body.note).toBe("string");
    expect(
      (body.groups as BurgGroupSummary[]).every((g) => g.burg_count === 0),
    ).toBe(true);
  });
});

describe("list_burg_groups tool — error cases", () => {
  it("errors when options.burgs.groups is missing", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({ groups: undefined, burgs: [] }),
    );
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("options.burgs.groups is missing or not an array.");
  });

  it("errors when options.burgs.groups is not an array", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({ groups: { 0: "not-an-array" }, burgs: [] }),
    );
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = parse(result.content);
    expect(body.error).toBe("options.burgs.groups is missing or not an array.");
  });

  it("errors when include_inactive is non-boolean", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({ groups: [], burgs: [] }),
    );
    const result = await tool.execute({ include_inactive: "yes" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "include_inactive must be a boolean.",
    );
  });
});

describe("list_burg_groups tool — coercions", () => {
  it("active is strict-equal to true (truthy non-boolean → false)", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({
        groups: [
          { name: "true", active: true },
          { name: "truthy", active: 1 as unknown as boolean },
          { name: "false", active: false },
          { name: "missing" },
        ],
        burgs: [],
      }),
    );
    const body = parse((await tool.execute({})).content);
    const groups = body.groups as BurgGroupSummary[];
    expect(groups.map((g) => g.active)).toEqual([true, false, false, false]);
  });

  it("is_default is strict-equal to true; missing → false", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({
        groups: [
          { name: "default", isDefault: true, active: true },
          { name: "not", isDefault: false, active: true },
          { name: "missing", active: true },
        ],
        burgs: [],
      }),
    );
    const body = parse((await tool.execute({})).content);
    expect(
      (body.groups as BurgGroupSummary[]).map((g) => g.is_default),
    ).toEqual([true, false, false]);
  });
});

describe("list_burg_groups tool — array order preservation", () => {
  it("does not sort by `order` field — preserves stored array order", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({
        groups: [
          { name: "A", order: 3, active: true },
          { name: "B", order: 1, active: true },
          { name: "C", order: 2, active: true },
        ],
        burgs: [],
      }),
    );
    const body = parse((await tool.execute({})).content);
    expect((body.groups as BurgGroupSummary[]).map((g) => g.name)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("does not sort alphabetically", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({
        groups: [
          { name: "zulu", active: true },
          { name: "alpha", active: true },
          { name: "mike", active: true },
        ],
        burgs: [],
      }),
    );
    const body = parse((await tool.execute({})).content);
    expect((body.groups as BurgGroupSummary[]).map((g) => g.name)).toEqual([
      "zulu",
      "alpha",
      "mike",
    ]);
  });
});

describe("list_burg_groups tool — input tolerance", () => {
  it("accepts null input as defaults", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({
        groups: [{ name: "a", active: true }],
        burgs: [],
      }),
    );
    const result = await tool.execute(null);
    expect(result.isError).toBeFalsy();
    expect(parse(result.content).count).toBe(1);
  });

  it("accepts undefined input as defaults", async () => {
    const tool = createListBurgGroupsTool(
      makeRuntime({
        groups: [{ name: "a", active: true }],
        burgs: [],
      }),
    );
    const result = await tool.execute(undefined);
    expect(result.isError).toBeFalsy();
    expect(parse(result.content).count).toBe(1);
  });
});

describe("list_burg_groups — readBurgGroupsFromState helper", () => {
  it("returns error sentinel for non-array groups", () => {
    const result = readBurgGroupsFromState({ groups: null, burgs: [] });
    expect(result).toEqual({
      error: "options.burgs.groups is missing or not an array.",
    });
  });

  it("flags packBurgsMissing when burgs is undefined", () => {
    const result = readBurgGroupsFromState({
      groups: [{ name: "a" }],
      burgs: undefined,
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.packBurgsMissing).toBe(true);
    expect(result.groups[0].burg_count).toBe(0);
  });
});

describe("list_burg_groups — registry round-trip", () => {
  it("registers under name `list_burg_groups` and is callable via registry.run", async () => {
    expect(listBurgGroupsTool.name).toBe("list_burg_groups");
    const registry = new ToolRegistry();
    registry.register(listBurgGroupsTool);
    const tools = registry.list();
    expect(tools.map((t) => t.name)).toContain("list_burg_groups");

    const originalOptions = (globalThis as Record<string, unknown>).options;
    const originalPack = (globalThis as Record<string, unknown>).pack;
    try {
      (globalThis as Record<string, unknown>).options = {
        burgs: { groups: [{ name: "a", active: true }] },
      };
      (globalThis as Record<string, unknown>).pack = { burgs: [] };

      const result = await registry.run("list_burg_groups", {});
      expect(result.isError).toBeFalsy();
      const body = parse(result.content);
      expect(body.ok).toBe(true);
      expect(body.count).toBe(1);
    } finally {
      (globalThis as Record<string, unknown>).options = originalOptions;
      (globalThis as Record<string, unknown>).pack = originalPack;
    }
  });
});

describe("listBurgGroupsTool — default runtime smoke", () => {
  let originalOptions: unknown;
  let originalPack: unknown;
  beforeEach(() => {
    originalOptions = (globalThis as Record<string, unknown>).options;
    originalPack = (globalThis as Record<string, unknown>).pack;
  });
  afterEach(() => {
    (globalThis as Record<string, unknown>).options = originalOptions;
    (globalThis as Record<string, unknown>).pack = originalPack;
  });

  it("reads from globalThis.options and globalThis.pack", async () => {
    (globalThis as Record<string, unknown>).options = {
      burgs: {
        groups: [
          { name: "cities", active: true, isDefault: true, order: 1 },
          { name: "villages", active: true, order: 2 },
        ],
      },
    };
    (globalThis as Record<string, unknown>).pack = {
      burgs: [
        { group: "cities" },
        { group: "villages" },
        { group: "cities", removed: true },
      ],
    };
    const result = await listBurgGroupsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2);
    const groups = body.groups as BurgGroupSummary[];
    expect(groups[0].name).toBe("cities");
    expect(groups[0].burg_count).toBe(1);
    expect(groups[1].name).toBe("villages");
    expect(groups[1].burg_count).toBe(1);
  });

  it("errors when window.options.burgs is missing", async () => {
    (globalThis as Record<string, unknown>).options = {};
    (globalThis as Record<string, unknown>).pack = { burgs: [] };
    const result = await listBurgGroupsTool.execute({});
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "options.burgs.groups is missing or not an array.",
    );
  });
});
