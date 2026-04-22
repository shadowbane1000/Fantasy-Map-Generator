import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawState } from "./_shared";
import {
  createListDiplomacyTool,
  type DiplomacyListRuntime,
  type DiplomacyPair,
  listDiplomacyTool,
  readDiplomacyFromPack,
} from "./list-diplomacy";

function sampleStates(): RawState[] {
  return [
    { i: 0, name: "Neutrals", removed: true, diplomacy: [] },
    {
      i: 1,
      name: "Rookhold",
      diplomacy: ["x", "x", "Ally", "Enemy"],
    },
    {
      i: 2,
      name: "Ashholm",
      diplomacy: ["x", "Ally", "x", "Vassal"],
    },
    {
      i: 3,
      name: "Stormveil",
      diplomacy: ["x", "Enemy", "Suzerain", "x"],
    },
  ];
}

function runtimeOf(
  pairs: DiplomacyPair[] | null,
  resolver: (ref: number | string) => number | null = () => null,
): DiplomacyListRuntime {
  return {
    readDiplomacy: () => pairs,
    resolveStateRef: resolver,
  };
}

describe("readDiplomacyFromPack", () => {
  it("returns null when pack.states is missing", () => {
    expect(readDiplomacyFromPack(undefined)).toBeNull();
    expect(readDiplomacyFromPack({})).toBeNull();
  });

  it("emits unique a<b pairs, skipping id 0 and removed", () => {
    const pairs = readDiplomacyFromPack({ states: sampleStates() });
    expect(pairs).toHaveLength(3);
    expect(pairs?.[0]).toEqual({
      state_a: { i: 1, name: "Rookhold" },
      state_b: { i: 2, name: "Ashholm" },
      relation: "Ally",
    });
    expect(pairs?.[1]).toEqual({
      state_a: { i: 1, name: "Rookhold" },
      state_b: { i: 3, name: "Stormveil" },
      relation: "Enemy",
    });
    expect(pairs?.[2]).toEqual({
      state_a: { i: 2, name: "Ashholm" },
      state_b: { i: 3, name: "Stormveil" },
      relation: "Vassal",
    });
  });

  it("reports null when diplomacy is missing for a pair", () => {
    const states: RawState[] = [
      { i: 0, name: "Neutrals", removed: true, diplomacy: [] },
      { i: 1, name: "A" },
      { i: 2, name: "B" },
    ];
    const pairs = readDiplomacyFromPack({ states });
    expect(pairs).toEqual([
      {
        state_a: { i: 1, name: "A" },
        state_b: { i: 2, name: "B" },
        relation: null,
      },
    ]);
  });
});

describe("list_diplomacy tool", () => {
  const allPairs: DiplomacyPair[] = [
    {
      state_a: { i: 1, name: "Rookhold" },
      state_b: { i: 2, name: "Ashholm" },
      relation: "Ally",
    },
    {
      state_a: { i: 1, name: "Rookhold" },
      state_b: { i: 3, name: "Stormveil" },
      relation: "Enemy",
    },
    {
      state_a: { i: 2, name: "Ashholm" },
      state_b: { i: 3, name: "Stormveil" },
      relation: "Vassal",
    },
    {
      state_a: { i: 2, name: "Ashholm" },
      state_b: { i: 4, name: "Quiet" },
      relation: "Neutral",
    },
    {
      state_a: { i: 3, name: "Stormveil" },
      state_b: { i: 4, name: "Quiet" },
      relation: "Unknown",
    },
  ];

  it("default exclude_neutral drops Neutral/Unknown/x", async () => {
    const tool = createListDiplomacyTool(runtimeOf(allPairs));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(3);
    expect(body.diplomacy.map((p: DiplomacyPair) => p.relation)).toEqual([
      "Ally",
      "Enemy",
      "Vassal",
    ]);
    expect(body.filters.exclude_neutral).toBe(true);
  });

  it("exclude_neutral:false keeps all pairs", async () => {
    const tool = createListDiplomacyTool(runtimeOf(allPairs));
    const result = await tool.execute({ exclude_neutral: false });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(5);
  });

  it("state filter by id keeps only touching pairs", async () => {
    const tool = createListDiplomacyTool(
      runtimeOf(allPairs, (ref) => (ref === 3 ? 3 : null)),
    );
    const result = await tool.execute({ state: 3 });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.diplomacy.map((p: DiplomacyPair) => p.relation)).toEqual([
      "Enemy",
      "Vassal",
    ]);
  });

  it("state filter by name resolved via runtime", async () => {
    const tool = createListDiplomacyTool(
      runtimeOf(allPairs, (ref) =>
        typeof ref === "string" && ref.toLowerCase() === "stormveil" ? 3 : null,
      ),
    );
    const result = await tool.execute({ state: "STORMVEIL" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
  });

  it("relation filter with alias", async () => {
    const tool = createListDiplomacyTool(runtimeOf(allPairs));
    const result = await tool.execute({ relation: "at war" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.diplomacy[0]?.relation).toBe("Enemy");
    expect(body.filters.relation).toBe("Enemy");
  });

  it("rejects unknown state filter", async () => {
    const tool = createListDiplomacyTool(runtimeOf(allPairs));
    const result = await tool.execute({ state: "Nowhere" });
    expect(result.isError).toBe(true);
  });

  it("rejects unknown relation", async () => {
    const tool = createListDiplomacyTool(runtimeOf(allPairs));
    const result = await tool.execute({ relation: "Frenemy" });
    expect(result.isError).toBe(true);
  });

  it("rejects invalid filter types", async () => {
    const tool = createListDiplomacyTool(runtimeOf(allPairs));
    expect((await tool.execute({ exclude_neutral: "yes" })).isError).toBe(true);
    expect((await tool.execute({ state: 1.5 })).isError).toBe(true);
    expect((await tool.execute({ relation: 42 })).isError).toBe(true);
  });

  it("honors pagination", async () => {
    const tool = createListDiplomacyTool(runtimeOf(allPairs));
    const result = await tool.execute({
      exclude_neutral: false,
      limit: 2,
      offset: 2,
    });
    const body = JSON.parse(result.content);
    expect(body.diplomacy).toHaveLength(2);
  });

  it("returns not-ready when the runtime returns null", async () => {
    const tool = createListDiplomacyTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
  });
});

describe("defaultDiplomacyListRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      states: sampleStates(),
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("reads from the live pack", async () => {
    const result = await listDiplomacyTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(3);
    expect(body.diplomacy.map((p: DiplomacyPair) => p.relation)).toEqual([
      "Ally",
      "Enemy",
      "Vassal",
    ]);
  });
});
