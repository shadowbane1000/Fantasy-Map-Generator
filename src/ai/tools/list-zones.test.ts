import { describe, expect, it } from "vitest";
import {
  createListZonesTool,
  readZonesFromPack,
  type ZonePackLike,
  type ZoneSummary,
  type ZonesRuntime,
} from "./list-zones";

function fakeZones(): ZoneSummary[] {
  return [
    {
      i: 0,
      name: "Rookwood Invasion",
      type: "Invasion",
      color: "#ff0000",
      cells: 42,
      hidden: false,
    },
    {
      i: 1,
      name: "Black Plague",
      type: "Disease",
      color: "#550055",
      cells: 128,
      hidden: false,
    },
    {
      i: 2,
      name: "Crusade of Light",
      type: "Crusade",
      color: "#ffff00",
      cells: 60,
      hidden: true,
    },
    {
      i: 3,
      name: "Second Invasion",
      type: "Invasion",
      color: "#aa0000",
      cells: 20,
      hidden: false,
    },
  ];
}

function runtimeOf(zones: ZoneSummary[] | null): ZonesRuntime {
  return { readZones: () => zones };
}

describe("list_zones tool", () => {
  it("returns visible zones by default (excludes hidden)", async () => {
    const tool = createListZonesTool(runtimeOf(fakeZones()));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(3);
    expect(body.zones.map((z: ZoneSummary) => z.i)).toEqual([0, 1, 3]);
    expect(body.filters).toEqual({ type: null, include_hidden: false });
  });

  it("include_hidden:true returns all zones", async () => {
    const tool = createListZonesTool(runtimeOf(fakeZones()));
    const result = await tool.execute({ include_hidden: true });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(4);
    expect(body.zones).toEqual(fakeZones());
    expect(body.filters.include_hidden).toBe(true);
  });

  it("filters by type case-insensitively", async () => {
    const tool = createListZonesTool(runtimeOf(fakeZones()));
    const result = await tool.execute({ type: "INVASION" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.zones.map((z: ZoneSummary) => z.i)).toEqual([0, 3]);
    expect(body.filters.type).toBe("invasion");
  });

  it("unknown type yields empty items but valid echo", async () => {
    const tool = createListZonesTool(runtimeOf(fakeZones()));
    const result = await tool.execute({ type: "Earthquake" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(0);
    expect(body.zones).toEqual([]);
    expect(body.filters.type).toBe("earthquake");
  });

  it("honors limit and offset", async () => {
    const tool = createListZonesTool(runtimeOf(fakeZones()));
    const result = await tool.execute({
      include_hidden: true,
      limit: 2,
      offset: 1,
    });
    const body = JSON.parse(result.content);
    expect(body.zones.map((z: ZoneSummary) => z.i)).toEqual([1, 2]);
  });

  it("reports not-ready when the pack has no zones", async () => {
    const tool = createListZonesTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns an empty list when the pack has an empty zones array", async () => {
    const tool = createListZonesTool(runtimeOf([]));
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    expect(body.total).toBe(0);
    expect(body.zones).toEqual([]);
  });

  it("rejects non-string type filter", async () => {
    const tool = createListZonesTool(runtimeOf(fakeZones()));
    const result = await tool.execute({ type: 42 });
    expect(result.isError).toBe(true);
  });

  it("rejects non-boolean include_hidden", async () => {
    const tool = createListZonesTool(runtimeOf(fakeZones()));
    const result = await tool.execute({ include_hidden: "yes" });
    expect(result.isError).toBe(true);
  });
});

describe("readZonesFromPack", () => {
  it("returns null when pack has no zones array", () => {
    expect(readZonesFromPack(undefined)).toBeNull();
    expect(readZonesFromPack({} as ZonePackLike)).toBeNull();
  });

  it("maps each zone and returns cells as a count", () => {
    const pack: ZonePackLike = {
      zones: [
        {
          i: 1,
          name: "Invasion of the North",
          type: "Invasion",
          color: "#ff0000",
          cells: [1, 2, 3, 4, 5],
        },
      ],
    };
    expect(readZonesFromPack(pack)).toEqual([
      {
        i: 1,
        name: "Invasion of the North",
        type: "Invasion",
        color: "#ff0000",
        cells: 5,
        hidden: false,
      },
    ]);
  });

  it("coerces missing fields to null/0/false", () => {
    const pack: ZonePackLike = { zones: [{ i: 7 }] };
    expect(readZonesFromPack(pack)).toEqual([
      {
        i: 7,
        name: "",
        type: null,
        color: null,
        cells: 0,
        hidden: false,
      },
    ]);
  });
});
