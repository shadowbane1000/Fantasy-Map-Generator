import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createListRulersTool,
  listRulersTool,
  type RulerCollectionLike,
  type RulerSummary,
  type RulersRuntime,
  readRulersFromCollection,
} from "./list-rulers";

function fakeRulers(): RulerSummary[] {
  return [
    {
      i: 0,
      type: "Ruler",
      points: [
        [0, 0],
        [30, 40],
      ],
      length: 50,
      unit: "mi",
    },
    {
      i: 1,
      type: "Opisometer",
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      length: 20,
      unit: "mi",
    },
    {
      i: 2,
      type: "Planimeter",
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      length: 40,
      unit: "mi",
    },
  ];
}

function runtimeOf(rulers: RulerSummary[] | null): RulersRuntime {
  return { readRulers: () => rulers };
}

describe("list_rulers tool", () => {
  it("returns the full list by default", async () => {
    const rulers = fakeRulers();
    const tool = createListRulersTool(runtimeOf(rulers));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(3);
    expect(body.rulers).toEqual(rulers);
  });

  it("honors limit/offset", async () => {
    const rulers = fakeRulers();
    const tool = createListRulersTool(runtimeOf(rulers));
    const result = await tool.execute({ limit: 1, offset: 1 });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(3);
    expect(body.limit).toBe(1);
    expect(body.offset).toBe(1);
    expect(body.rulers).toEqual(rulers.slice(1, 2));
  });

  it("rejects invalid paging", async () => {
    const tool = createListRulersTool(runtimeOf(fakeRulers()));
    for (const bad of [{ limit: 0 }, { limit: 501 }, { limit: 1.5 }]) {
      expect((await tool.execute(bad)).isError).toBe(true);
    }
    for (const bad of [{ offset: -1 }, { offset: 1.5 }]) {
      expect((await tool.execute(bad)).isError).toBe(true);
    }
  });

  it("errors when the runtime isn't ready", async () => {
    const tool = createListRulersTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("exposes the expected schema", () => {
    const tool = createListRulersTool(runtimeOf(fakeRulers()));
    expect(tool.name).toBe("list_rulers");
    expect(tool.input_schema.properties).toHaveProperty("limit");
    expect(tool.input_schema.properties).toHaveProperty("offset");
    expect(listRulersTool.name).toBe("list_rulers");
  });
});

describe("readRulersFromCollection", () => {
  class StubRuler {
    constructor(
      public id: number,
      public points: number[][],
    ) {}
  }
  class StubRouteOpisometer {
    constructor(
      public id: number,
      public points: number[][],
    ) {}
  }

  it("maps points, constructor name, and computes straight-line length", () => {
    const rulers: RulerCollectionLike = {
      data: [
        new StubRuler(0, [
          [0, 0],
          [3, 4],
        ]),
      ],
    };
    const out = readRulersFromCollection(rulers, "mi");
    expect(out).toHaveLength(1);
    expect(out?.[0]).toEqual({
      i: 0,
      type: "StubRuler",
      points: [
        [0, 0],
        [3, 4],
      ],
      length: 5,
      unit: "mi",
    });
  });

  it("Planimeter length is the closed-polygon perimeter", () => {
    // Real class named `Planimeter` so `constructor.name === "Planimeter"`,
    // which triggers the closing-segment branch in computeRulerLength.
    class Planimeter {
      constructor(
        public id: number,
        public points: number[][],
      ) {}
    }
    const rulers: RulerCollectionLike = { data: [] };
    rulers.data = [
      new Planimeter(0, [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]),
    ];
    const out = readRulersFromCollection(rulers, "mi");
    expect(out?.[0].type).toBe("Planimeter");
    // perimeter = 10 + 10 + 10 + 10 = 40
    expect(out?.[0].length).toBe(40);
  });

  it("Opisometer length is the open polyline (not closed)", () => {
    class Opisometer {
      constructor(
        public id: number,
        public points: number[][],
      ) {}
    }
    const rulers: RulerCollectionLike = {
      data: [
        new Opisometer(0, [
          [0, 0],
          [10, 0],
          [10, 10],
        ]),
      ],
    };
    const out = readRulersFromCollection(rulers, null);
    expect(out?.[0].type).toBe("Opisometer");
    expect(out?.[0].length).toBe(20); // 10 + 10, no closing segment
  });

  it("RouteOpisometer type survives", () => {
    const rulers: RulerCollectionLike = {
      data: [
        new StubRouteOpisometer(2, [
          [0, 0],
          [1, 0],
        ]),
      ],
    };
    const out = readRulersFromCollection(rulers, "km");
    expect(out?.[0].type).toBe("StubRouteOpisometer");
    expect(out?.[0].i).toBe(2);
    expect(out?.[0].unit).toBe("km");
  });

  it("tolerates malformed points (non-pair dropped, non-finite -> 0)", () => {
    class Ruler {
      constructor(
        public id: number,
        public points: unknown,
      ) {}
    }
    const rulers: RulerCollectionLike = {
      data: [
        new Ruler(0, [
          [0, 0],
          [Number.NaN, 5],
          [7], // too short
          "not-a-pair",
          [3, Number.POSITIVE_INFINITY],
        ]),
      ],
    };
    const out = readRulersFromCollection(rulers, null);
    expect(out?.[0].points).toEqual([
      [0, 0],
      [0, 5],
      [3, 0],
    ]);
    // length: hypot(0,5) + hypot(3,5) = 5 + sqrt(34)
    expect(out?.[0].length).toBeCloseTo(5 + Math.hypot(3, 5), 9);
  });

  it("ignores entries with fewer than 2 usable points for length", () => {
    class Ruler {
      constructor(
        public id: number,
        public points: unknown,
      ) {}
    }
    const rulers: RulerCollectionLike = {
      data: [new Ruler(0, []), new Ruler(1, [[1, 2]])],
    };
    const out = readRulersFromCollection(rulers, null);
    expect(out?.[0].length).toBe(0);
    expect(out?.[1].length).toBe(0);
  });

  it("returns null when rulers is missing or data is not an array", () => {
    expect(readRulersFromCollection(undefined, "mi")).toBeNull();
    expect(readRulersFromCollection(null, "mi")).toBeNull();
    expect(
      readRulersFromCollection(
        { data: "nope" } as unknown as RulerCollectionLike,
        "mi",
      ),
    ).toBeNull();
  });

  it("passes unit argument through to each summary", () => {
    class Ruler {
      constructor(
        public id: number,
        public points: number[][],
      ) {}
    }
    const rulers: RulerCollectionLike = {
      data: [
        new Ruler(0, [
          [0, 0],
          [1, 0],
        ]),
      ],
    };
    expect(readRulersFromCollection(rulers, null)?.[0].unit).toBeNull();
    expect(readRulersFromCollection(rulers, "lg")?.[0].unit).toBe("lg");
  });
});

describe("defaultRulersRuntime (integration)", () => {
  class Ruler {
    constructor(
      public id: number,
      public points: number[][],
    ) {}
  }
  class Opisometer {
    constructor(
      public id: number,
      public points: number[][],
    ) {}
  }

  const originalRulers = (globalThis as { rulers?: unknown }).rulers;

  beforeEach(() => {
    const data = [
      new Ruler(0, [
        [0, 0],
        [3, 4],
      ]),
      new Opisometer(1, [
        [0, 0],
        [5, 0],
        [5, 5],
      ]),
    ];
    (globalThis as unknown as { rulers: unknown }).rulers = { data };
  });

  afterEach(() => {
    (globalThis as { rulers?: unknown }).rulers = originalRulers;
  });

  it("reads the live rulers.data through the default runtime", async () => {
    const result = await listRulersTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    // unit is null in the node test env because there's no DOM #distanceUnitInput.
    expect(body.rulers[0]).toEqual({
      i: 0,
      type: "Ruler",
      points: [
        [0, 0],
        [3, 4],
      ],
      length: 5,
      unit: null,
    });
    expect(body.rulers[1].type).toBe("Opisometer");
    expect(body.rulers[1].length).toBe(10);
  });

  it("returns a not-ready error when window.rulers is missing", async () => {
    (globalThis as { rulers?: unknown }).rulers = undefined;
    const result = await listRulersTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("tolerates an empty rulers.data", async () => {
    (globalThis as unknown as { rulers: { data: unknown[] } }).rulers = {
      data: [],
    };
    const result = await listRulersTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(0);
    expect(body.rulers).toEqual([]);
  });
});
