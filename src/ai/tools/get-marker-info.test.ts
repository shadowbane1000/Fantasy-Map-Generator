import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetMarkerInfoTool,
  defaultMarkerInfoRuntime,
  getMarkerInfoTool,
  MARKER_LEGEND_MAX_CHARS,
  type MarkerInfo,
  type MarkerInfoPackLike,
  type MarkerInfoRuntime,
  type ReadMarkerInfoResult,
  readMarkerInfoFromPack,
} from "./get-marker-info";

interface FakeMarker {
  i: number;
  type?: string;
  icon?: string;
  x?: number;
  y?: number;
  cell?: number;
  dx?: number;
  dy?: number;
  px?: number;
  size?: number;
  pin?: string;
  fill?: string;
  stroke?: string;
  pinned?: boolean;
  lock?: boolean;
  removed?: boolean;
}

interface FakeNote {
  id: string;
  name?: string;
  legend?: string;
}

interface FakePack {
  markers: Array<FakeMarker | undefined>;
}

function makePack(): FakePack {
  return {
    markers: [
      {
        i: 1,
        type: "volcano",
        icon: "🌋",
        x: 120,
        y: 240,
        cell: 42,
        size: 30,
        px: 16,
        dx: 50,
        dy: 48,
        pin: "square",
        fill: "#ff3300",
        stroke: "#001144",
        pinned: true,
        lock: false,
      },
      {
        i: 2,
        type: "custom",
        icon: "📍",
        x: 5,
        y: 10,
        cell: 7,
      },
      {
        i: 3,
        icon: "⚔",
        x: 100,
        y: 100,
        cell: 15,
        removed: true,
      },
      {
        i: 4,
        icon: "⛰",
        x: 200,
        y: 300,
        cell: 25,
        pinned: false,
        lock: true,
      },
    ],
  };
}

function makeNotes(): FakeNote[] {
  return [
    {
      id: "marker1",
      name: "Mount Ember",
      legend: "A violent, smoking peak — last erupted a century ago.",
    },
    {
      id: "marker2",
      name: "Camp Ridge",
      legend: "",
    },
    { id: "stateLabel1", name: "Kingdom of Altaria" },
  ];
}

function runtimeReturning(result: ReadMarkerInfoResult): MarkerInfoRuntime {
  return { readMarker: () => result };
}

describe("get_marker_info tool — pure / seam", () => {
  it("returns all fields for a fully populated marker", async () => {
    const pack = makePack();
    const notes = makeNotes();
    const info = readMarkerInfoFromPack(
      pack as MarkerInfoPackLike,
      notes as unknown as Parameters<typeof readMarkerInfoFromPack>[1],
      1,
    );
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const tool = createGetMarkerInfoTool(runtimeReturning(info));
    const result = await tool.execute({ marker: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.i).toBe(1);
    expect(body.type).toBe("volcano");
    expect(body.icon).toBe("🌋");
    expect(body.x).toBe(120);
    expect(body.y).toBe(240);
    expect(body.cell).toBe(42);
    expect(body.size).toBe(30);
    expect(body.px).toBe(16);
    expect(body.dx).toBe(50);
    expect(body.dy).toBe(48);
    expect(body.pin).toBe("square");
    expect(body.pinned).toBe(true);
    expect(body.lock).toBe(false);
    expect(body.colors).toEqual({ fill: "#ff3300", stroke: "#001144" });
    expect(body.note).toEqual({
      id: "marker1",
      name: "Mount Ember",
      legend: "A violent, smoking peak — last erupted a century ago.",
    });
    expect(body.note.legend_truncated).toBeUndefined();
  });

  it("returns null for each optional field that is absent", () => {
    const pack: FakePack = { markers: [{ i: 5, x: 1, y: 2, cell: 3 }] };
    const info = readMarkerInfoFromPack(
      pack as MarkerInfoPackLike,
      [],
      5,
    ) as MarkerInfo;
    expect(info.type).toBeNull();
    expect(info.icon).toBeNull();
    expect(info.size).toBeNull();
    expect(info.px).toBeNull();
    expect(info.dx).toBeNull();
    expect(info.dy).toBeNull();
    expect(info.pin).toBeNull();
    expect(info.colors).toEqual({ fill: null, stroke: null });
  });

  it("colors echo raw marker.fill / marker.stroke with null fallback", () => {
    const pack: FakePack = {
      markers: [{ i: 6, fill: "rgb(10,20,30)" }],
    };
    const info = readMarkerInfoFromPack(
      pack as MarkerInfoPackLike,
      [],
      6,
    ) as MarkerInfo;
    expect(info.colors).toEqual({ fill: "rgb(10,20,30)", stroke: null });
  });

  it("pinned / lock default to false when missing, true when set", () => {
    const pack = makePack();
    const m1 = readMarkerInfoFromPack(
      pack as MarkerInfoPackLike,
      [],
      2,
    ) as MarkerInfo;
    expect(m1.pinned).toBe(false);
    expect(m1.lock).toBe(false);

    const m4 = readMarkerInfoFromPack(
      pack as MarkerInfoPackLike,
      [],
      4,
    ) as MarkerInfo;
    expect(m4.pinned).toBe(false);
    expect(m4.lock).toBe(true);

    const m1pinned = readMarkerInfoFromPack(
      pack as MarkerInfoPackLike,
      [],
      1,
    ) as MarkerInfo;
    expect(m1pinned.pinned).toBe(true);
  });

  it("x / y / cell default to 0 when absent (list_markers parity)", () => {
    const pack: FakePack = { markers: [{ i: 7 }] };
    const info = readMarkerInfoFromPack(
      pack as MarkerInfoPackLike,
      [],
      7,
    ) as MarkerInfo;
    expect(info.x).toBe(0);
    expect(info.y).toBe(0);
    expect(info.cell).toBe(0);
  });

  it("note resolves from window.notes by 'marker' + i; null when missing", () => {
    const pack = makePack();
    const notes = makeNotes();
    const withNote = readMarkerInfoFromPack(
      pack as MarkerInfoPackLike,
      notes as unknown as Parameters<typeof readMarkerInfoFromPack>[1],
      1,
    ) as MarkerInfo;
    expect(withNote.note).toEqual({
      id: "marker1",
      name: "Mount Ember",
      legend: "A violent, smoking peak — last erupted a century ago.",
    });

    // Marker 4 has no matching note.
    const withoutNote = readMarkerInfoFromPack(
      pack as MarkerInfoPackLike,
      notes as unknown as Parameters<typeof readMarkerInfoFromPack>[1],
      4,
    ) as MarkerInfo;
    expect(withoutNote.note).toEqual({
      id: null,
      name: null,
      legend: null,
    });
  });

  it("long legends are truncated with an ellipsis + legend_truncated flag", () => {
    const longLegend = "A".repeat(MARKER_LEGEND_MAX_CHARS + 50);
    const pack: FakePack = { markers: [{ i: 9 }] };
    const notes: FakeNote[] = [
      { id: "marker9", name: "Big", legend: longLegend },
    ];
    const info = readMarkerInfoFromPack(
      pack as MarkerInfoPackLike,
      notes as unknown as Parameters<typeof readMarkerInfoFromPack>[1],
      9,
    ) as MarkerInfo;
    expect(info.note.legend).not.toBeNull();
    expect(info.note.legend?.length).toBe(MARKER_LEGEND_MAX_CHARS);
    expect(info.note.legend?.endsWith("…")).toBe(true);
    expect(info.note.legend_truncated).toBe(true);

    // Short legend passes through unchanged with no flag.
    const shortPack: FakePack = { markers: [{ i: 10 }] };
    const shortNotes: FakeNote[] = [
      { id: "marker10", name: "Small", legend: "hi" },
    ];
    const shortInfo = readMarkerInfoFromPack(
      shortPack as MarkerInfoPackLike,
      shortNotes as unknown as Parameters<typeof readMarkerInfoFromPack>[1],
      10,
    ) as MarkerInfo;
    expect(shortInfo.note.legend).toBe("hi");
    expect(shortInfo.note.legend_truncated).toBeUndefined();
  });

  it("string-ref resolves by case-insensitive marker-note name", () => {
    const pack = makePack();
    const notes = makeNotes();
    const info = readMarkerInfoFromPack(
      pack as MarkerInfoPackLike,
      notes as unknown as Parameters<typeof readMarkerInfoFromPack>[1],
      "mount ember",
    ) as MarkerInfo;
    expect(info.i).toBe(1);

    const upper = readMarkerInfoFromPack(
      pack as MarkerInfoPackLike,
      notes as unknown as Parameters<typeof readMarkerInfoFromPack>[1],
      "MOUNT EMBER",
    ) as MarkerInfo;
    expect(upper.i).toBe(1);
  });

  it("returns 'not-found' for unknown / removed refs", () => {
    const pack = makePack();
    const notes = makeNotes();
    expect(
      readMarkerInfoFromPack(
        pack as MarkerInfoPackLike,
        notes as unknown as Parameters<typeof readMarkerInfoFromPack>[1],
        99,
      ),
    ).toBe("not-found");
    // Marker 3 is flagged removed.
    expect(
      readMarkerInfoFromPack(
        pack as MarkerInfoPackLike,
        notes as unknown as Parameters<typeof readMarkerInfoFromPack>[1],
        3,
      ),
    ).toBe("not-found");
    // Unknown name.
    expect(
      readMarkerInfoFromPack(
        pack as MarkerInfoPackLike,
        notes as unknown as Parameters<typeof readMarkerInfoFromPack>[1],
        "doesNotExist",
      ),
    ).toBe("not-found");
  });

  it("returns 'not-ready' when pack or pack.markers is missing", () => {
    expect(readMarkerInfoFromPack(undefined, [], 1)).toBe("not-ready");
    expect(
      readMarkerInfoFromPack(
        { markers: undefined } as MarkerInfoPackLike,
        [],
        1,
      ),
    ).toBe("not-ready");
  });

  it("is exported as getMarkerInfoTool with the expected schema", () => {
    expect(getMarkerInfoTool.name).toBe("get_marker_info");
    expect(getMarkerInfoTool.input_schema.type).toBe("object");
    expect(getMarkerInfoTool.input_schema.required).toEqual(["marker"]);
    expect(getMarkerInfoTool.input_schema.properties.marker).toBeDefined();
  });

  it("tool rejects non-integer / missing marker via parseEntityRef", async () => {
    const tool = createGetMarkerInfoTool(runtimeReturning("not-found"));
    for (const bad of [
      {},
      { marker: 1.5 },
      { marker: null },
      { marker: "" },
      { marker: -3 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /positive integer id or a non-empty name/i,
      );
    }
  });

  it("tool surfaces not-found as a structured error with the ref quoted", async () => {
    const tool = createGetMarkerInfoTool(runtimeReturning("not-found"));
    const result = await tool.execute({ marker: "ghost" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No marker found/i);
    expect(JSON.parse(result.content).error).toMatch(/"ghost"/);
  });

  it("tool surfaces not-ready as a structured error", async () => {
    const tool = createGetMarkerInfoTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ marker: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});

// ----- defaultMarkerInfoRuntime integration -----

describe("defaultMarkerInfoRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    notes?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalNotes = globalsRef.notes;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
    globalsRef.notes = makeNotes() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.notes = originalNotes;
  });

  it("reads a real packed marker through the default runtime", () => {
    const info = defaultMarkerInfoRuntime.readMarker(1);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const mi = info as MarkerInfo;
    expect(mi.i).toBe(1);
    expect(mi.type).toBe("volcano");
    expect(mi.note.name).toBe("Mount Ember");
    expect(mi.colors).toEqual({ fill: "#ff3300", stroke: "#001144" });
  });

  it("returns 'not-ready' when pack is missing", async () => {
    globalsRef.pack = undefined;
    expect(defaultMarkerInfoRuntime.readMarker(1)).toBe("not-ready");
    const result = await getMarkerInfoTool.execute({ marker: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-found' for unknown marker id", async () => {
    expect(defaultMarkerInfoRuntime.readMarker(999)).toBe("not-found");
    const result = await getMarkerInfoTool.execute({ marker: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No marker found/i);
  });
});
