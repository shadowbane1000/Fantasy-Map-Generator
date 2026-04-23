import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetZoneInfoTool,
  DEFAULT_ZONE_CELLS_LIMIT,
  defaultZoneInfoRuntime,
  getZoneInfoTool,
  MAX_ZONE_CELLS_LIMIT,
  type ReadZoneResult,
  readZoneInfoFromPack,
  type ZoneInfo,
  type ZoneInfoPackLike,
  type ZoneInfoRuntime,
} from "./get-zone-info";

interface FakeZone {
  i: number;
  name?: string;
  type?: string;
  color?: string;
  cells?: number[];
  hidden?: boolean;
  removed?: boolean;
}

interface FakePack {
  zones: Array<FakeZone | undefined>;
}

function makePack(): FakePack {
  return {
    zones: [
      {
        i: 0,
        name: "First Zone",
        type: "Invasion",
        color: "#aabbcc",
        cells: [1, 2, 3, 4, 5],
        hidden: false,
      },
      {
        i: 2,
        name: "Plague Outbreak",
        type: "Disease",
        color: "url(#hatch7)",
        cells: [10, 11, 12],
        hidden: true,
      },
      {
        i: 5,
        name: "Unnamed Bare Zone",
        // type, color, cells, hidden all absent
      },
      {
        i: 7,
        name: "Removed Zone",
        type: "Crusade",
        color: "red",
        cells: [99],
        removed: true,
      },
      {
        i: 9,
        name: "Huge Zone",
        type: "Flood",
        color: "blue",
        cells: Array.from({ length: 12345 }, (_, k) => k),
        hidden: false,
      },
    ],
  };
}

function runtimeReturning(result: ReadZoneResult): ZoneInfoRuntime {
  return { readZone: () => result };
}

describe("get_zone_info tool — pure / seam", () => {
  it("returns all fields for a fully populated zone", async () => {
    const pack = makePack();
    const info = readZoneInfoFromPack(pack as ZoneInfoPackLike, 0);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const zi = info as ZoneInfo;
    expect(zi.i).toBe(0);
    expect(zi.name).toBe("First Zone");
    expect(zi.type).toBe("Invasion");
    expect(zi.color).toBe("#aabbcc");
    expect(zi.cells).toEqual([1, 2, 3, 4, 5]);
    expect(zi.cells_count).toBe(5);
    expect(zi.hidden).toBe(false);

    const tool = createGetZoneInfoTool(runtimeReturning(zi));
    const result = await tool.execute({ zone: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.i).toBe(0);
    expect(body.name).toBe("First Zone");
    expect(body.cells_count).toBe(5);
  });

  it("accepts zone id 0 (unlike states / burgs where 0 is a placeholder)", () => {
    const pack = makePack();
    const info = readZoneInfoFromPack(pack as ZoneInfoPackLike, 0) as ZoneInfo;
    expect(info.i).toBe(0);
  });

  it("resolves hidden=true for a hidden zone", () => {
    const pack = makePack();
    const info = readZoneInfoFromPack(pack as ZoneInfoPackLike, 2) as ZoneInfo;
    expect(info.hidden).toBe(true);
    expect(info.name).toBe("Plague Outbreak");
    expect(info.type).toBe("Disease");
    expect(info.color).toBe("url(#hatch7)");
  });

  it("returns null type/color and empty cells array when fields are missing", () => {
    const pack = makePack();
    const info = readZoneInfoFromPack(pack as ZoneInfoPackLike, 5) as ZoneInfo;
    expect(info.type).toBeNull();
    expect(info.color).toBeNull();
    expect(info.cells).toEqual([]);
    expect(info.cells_count).toBe(0);
    expect(info.hidden).toBe(false);
  });

  it("truncates cells to the given limit but reports full cells_count", () => {
    const pack = makePack();
    const info = readZoneInfoFromPack(
      pack as ZoneInfoPackLike,
      9,
      100,
    ) as ZoneInfo;
    expect(info.cells).toHaveLength(100);
    expect(info.cells[0]).toBe(0);
    expect(info.cells[99]).toBe(99);
    expect(info.cells_count).toBe(12345);
  });

  it("limit 0 returns empty cells but full cells_count", () => {
    const pack = makePack();
    const info = readZoneInfoFromPack(
      pack as ZoneInfoPackLike,
      9,
      0,
    ) as ZoneInfo;
    expect(info.cells).toEqual([]);
    expect(info.cells_count).toBe(12345);
  });

  it("default limit caps the cells array at DEFAULT_ZONE_CELLS_LIMIT", () => {
    expect(DEFAULT_ZONE_CELLS_LIMIT).toBe(10000);
    expect(MAX_ZONE_CELLS_LIMIT).toBe(10000);
    const pack = makePack();
    const info = readZoneInfoFromPack(pack as ZoneInfoPackLike, 9) as ZoneInfo;
    expect(info.cells).toHaveLength(DEFAULT_ZONE_CELLS_LIMIT);
    expect(info.cells_count).toBe(12345);
  });

  it("does not truncate when the zone has fewer cells than the limit", () => {
    const pack = makePack();
    const info = readZoneInfoFromPack(pack as ZoneInfoPackLike, 2) as ZoneInfo;
    expect(info.cells).toEqual([10, 11, 12]);
    expect(info.cells_count).toBe(3);
  });

  it("returns 'not-found' for an unknown numeric id", () => {
    const pack = makePack();
    expect(readZoneInfoFromPack(pack as ZoneInfoPackLike, 999)).toBe(
      "not-found",
    );
  });

  it("returns 'not-found' for a removed zone", () => {
    const pack = makePack();
    expect(readZoneInfoFromPack(pack as ZoneInfoPackLike, 7)).toBe("not-found");
    expect(readZoneInfoFromPack(pack as ZoneInfoPackLike, "removed zone")).toBe(
      "not-found",
    );
  });

  it("resolves by case-insensitive name", () => {
    const pack = makePack();
    const info = readZoneInfoFromPack(
      pack as ZoneInfoPackLike,
      "PLAGUE outbreak",
    ) as ZoneInfo;
    expect(info.i).toBe(2);
  });

  it("returns 'not-ready' when pack or pack.zones is missing", () => {
    expect(readZoneInfoFromPack(undefined, 0)).toBe("not-ready");
    expect(
      readZoneInfoFromPack({ zones: undefined } as ZoneInfoPackLike, 0),
    ).toBe("not-ready");
  });

  it("tool surfaces not-ready as a structured error", async () => {
    const tool = createGetZoneInfoTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ zone: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("tool surfaces not-found as a structured error with the ref quoted", async () => {
    const tool = createGetZoneInfoTool(runtimeReturning("not-found"));
    const result = await tool.execute({ zone: "ghost" });
    expect(result.isError).toBe(true);
    const msg = JSON.parse(result.content).error;
    expect(msg).toMatch(/No zone found/i);
    expect(msg).toMatch(/"ghost"/);
  });

  it("tool rejects missing / negative / non-integer / empty-string refs", async () => {
    const pack = makePack();
    const tool = createGetZoneInfoTool({
      readZone: (ref, limit) =>
        readZoneInfoFromPack(pack as ZoneInfoPackLike, ref, limit),
    });
    const badInputs: Array<Record<string, unknown>> = [
      {},
      { zone: null },
      { zone: -1 },
      { zone: 1.5 },
      { zone: "" },
      { zone: "   " },
    ];
    for (const bad of badInputs) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /non-negative integer id or a non-empty name/i,
      );
    }
  });

  it("tool rejects non-integer / out-of-range limit values", async () => {
    const pack = makePack();
    const tool = createGetZoneInfoTool({
      readZone: (ref, limit) =>
        readZoneInfoFromPack(pack as ZoneInfoPackLike, ref, limit),
    });
    const badLimits: Array<Record<string, unknown>> = [
      { zone: 0, limit: -1 },
      { zone: 0, limit: 1.5 },
      { zone: 0, limit: "10" },
      { zone: 0, limit: MAX_ZONE_CELLS_LIMIT + 1 },
    ];
    for (const bad of badLimits) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/i);
    }
  });

  it("tool accepts integer ids at the zero boundary and name refs", async () => {
    const pack = makePack();
    const tool = createGetZoneInfoTool({
      readZone: (ref, limit) =>
        readZoneInfoFromPack(pack as ZoneInfoPackLike, ref, limit),
    });
    const r1 = await tool.execute({ zone: 0 });
    expect(r1.isError).toBeFalsy();
    expect(JSON.parse(r1.content).i).toBe(0);

    const r2 = await tool.execute({ zone: "First Zone" });
    expect(r2.isError).toBeFalsy();
    expect(JSON.parse(r2.content).i).toBe(0);
  });

  it("passes limit through to the runtime", async () => {
    const pack = makePack();
    const tool = createGetZoneInfoTool({
      readZone: (ref, limit) =>
        readZoneInfoFromPack(pack as ZoneInfoPackLike, ref, limit),
    });
    const r = await tool.execute({ zone: 9, limit: 5 });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.cells).toHaveLength(5);
    expect(body.cells_count).toBe(12345);
  });

  it("is exported as getZoneInfoTool with the expected schema", () => {
    expect(getZoneInfoTool.name).toBe("get_zone_info");
    expect(getZoneInfoTool.input_schema.type).toBe("object");
    expect(getZoneInfoTool.input_schema.required).toEqual(["zone"]);
    expect(getZoneInfoTool.input_schema.properties.zone).toBeDefined();
    expect(getZoneInfoTool.input_schema.properties.limit).toBeDefined();
  });
});

// ----- defaultZoneInfoRuntime integration -----

describe("defaultZoneInfoRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
  };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads a real packed zone through the default runtime", () => {
    const info = defaultZoneInfoRuntime.readZone(0, DEFAULT_ZONE_CELLS_LIMIT);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const zi = info as ZoneInfo;
    expect(zi.i).toBe(0);
    expect(zi.name).toBe("First Zone");
    expect(zi.type).toBe("Invasion");
    expect(zi.cells_count).toBe(5);
  });

  it("resolves by case-insensitive name", () => {
    const info = defaultZoneInfoRuntime.readZone(
      "plague outbreak",
      DEFAULT_ZONE_CELLS_LIMIT,
    );
    const zi = info as ZoneInfo;
    expect(zi.i).toBe(2);
    expect(zi.hidden).toBe(true);
  });

  it("returns 'not-ready' when pack is missing", async () => {
    globalsRef.pack = undefined;
    expect(defaultZoneInfoRuntime.readZone(0, DEFAULT_ZONE_CELLS_LIMIT)).toBe(
      "not-ready",
    );
    const result = await getZoneInfoTool.execute({ zone: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-found' for unknown zone id", async () => {
    expect(defaultZoneInfoRuntime.readZone(999, DEFAULT_ZONE_CELLS_LIMIT)).toBe(
      "not-found",
    );
    const result = await getZoneInfoTool.execute({ zone: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No zone found/i);
  });

  it("returns 'not-found' for a removed zone via the default runtime", () => {
    expect(defaultZoneInfoRuntime.readZone(7, DEFAULT_ZONE_CELLS_LIMIT)).toBe(
      "not-found",
    );
  });
});
