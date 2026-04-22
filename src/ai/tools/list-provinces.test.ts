import { describe, expect, it } from "vitest";
import {
  createListProvincesTool,
  type ProvincePackLike,
  type ProvinceSummary,
  type ProvincesRuntime,
  readProvincesFromPack,
} from "./list-provinces";

function fakeProvinces(): ProvinceSummary[] {
  return [
    {
      i: 1,
      name: "Rookwood",
      fullName: "Duchy of Rookwood",
      formName: "Duchy",
      color: "#aaa",
      state: "Altaria",
      stateId: 1,
      burg: "Stormport",
      burgId: 10,
      pole: [5, 6],
    },
    {
      i: 2,
      name: "Seavale",
      fullName: "County of Seavale",
      formName: "County",
      color: "#bbb",
      state: "Borgnia",
      stateId: 2,
      burg: null,
      burgId: 0,
      pole: null,
    },
  ];
}

function runtimeOf(
  provinces: ProvinceSummary[] | null,
  resolver: (ref: number | string) => number | null = () => null,
): ProvincesRuntime {
  return {
    readProvinces: () => provinces,
    resolveStateRef: resolver,
  };
}

describe("list_provinces tool", () => {
  it("returns the full list", async () => {
    const list = fakeProvinces();
    const tool = createListProvincesTool(runtimeOf(list));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.provinces).toEqual(list);
    expect(body.filters.state).toBeNull();
  });

  it("honors limit/offset", async () => {
    const list = fakeProvinces();
    const tool = createListProvincesTool(runtimeOf(list));
    const result = await tool.execute({ limit: 1, offset: 1 });
    const body = JSON.parse(result.content);
    expect(body.provinces).toEqual(list.slice(1, 2));
  });

  it("rejects invalid paging", async () => {
    const tool = createListProvincesTool(runtimeOf(fakeProvinces()));
    for (const bad of [{ limit: 0 }, { limit: 501 }, { limit: 1.5 }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
    }
    for (const bad of [{ offset: -1 }, { offset: 1.5 }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
    }
  });

  it("filters by state id", async () => {
    const list = fakeProvinces();
    const tool = createListProvincesTool(
      runtimeOf(list, (ref) => (ref === 1 ? 1 : null)),
    );
    const result = await tool.execute({ state: 1 });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.provinces[0].stateId).toBe(1);
    expect(body.filters.state).toBe(1);
  });

  it("filters by state name (case-insensitive)", async () => {
    const list = fakeProvinces();
    const tool = createListProvincesTool(
      runtimeOf(list, (ref) =>
        typeof ref === "string" && ref.toLowerCase() === "borgnia" ? 2 : null,
      ),
    );
    const result = await tool.execute({ state: "Borgnia" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.provinces[0].stateId).toBe(2);
  });

  it("errors on unresolved state filter", async () => {
    const tool = createListProvincesTool(
      runtimeOf(fakeProvinces(), () => null),
    );
    const result = await tool.execute({ state: "Nowhere" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/resolve/i);
  });

  it("errors when the map isn't ready", async () => {
    const tool = createListProvincesTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});

describe("readProvincesFromPack", () => {
  it("skips index 0 and removed, resolves state + burg", () => {
    const burgs = new Array(11).fill(undefined);
    burgs[0] = { i: 0 };
    burgs[10] = { i: 10, name: "Stormport" };
    const pack: ProvincePackLike = {
      provinces: [
        { i: 0, name: "Placeholder" },
        {
          i: 1,
          name: "Rookwood",
          fullName: "Duchy of Rookwood",
          formName: "Duchy",
          color: "#aaa",
          state: 1,
          burg: 10,
          pole: [5, 6],
        },
        { i: 2, name: "Gone", removed: true },
        {
          i: 3,
          name: "NoBurg",
          state: 1,
          burg: 0,
        },
      ],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Altaria" },
      ],
      burgs,
    };
    const out = readProvincesFromPack(pack);
    expect(out).toHaveLength(2);
    const [a, b] = out ?? [];
    expect(a).toMatchObject({
      i: 1,
      name: "Rookwood",
      state: "Altaria",
      burg: "Stormport",
      burgId: 10,
      pole: [5, 6],
    });
    expect(b).toMatchObject({
      i: 3,
      name: "NoBurg",
      state: "Altaria",
      burg: null,
      burgId: 0,
      pole: null,
    });
  });

  it("maps missing fields to null", () => {
    const pack: ProvincePackLike = {
      provinces: [
        { i: 0, name: "Placeholder" },
        { i: 1, name: "Bare" },
      ],
    };
    const [p] = readProvincesFromPack(pack) ?? [];
    expect(p).toMatchObject({
      i: 1,
      name: "Bare",
      fullName: null,
      formName: null,
      color: null,
      state: null,
      stateId: 0,
      burg: null,
      burgId: 0,
      pole: null,
    });
  });

  it("returns null when pack/provinces are missing", () => {
    expect(readProvincesFromPack(undefined)).toBeNull();
    expect(readProvincesFromPack({})).toBeNull();
  });
});
