import { describe, expect, it } from "vitest";
import {
  createListMarkersTool,
  type MarkerPackLike,
  type MarkerSummary,
  type MarkersRuntime,
  readMarkersFromPack,
} from "./list-markers";

function fakeMarkers(): MarkerSummary[] {
  return [
    {
      i: 1,
      type: "castle",
      icon: "🏰",
      name: "Rookhold",
      legend: "Ancient stronghold",
      x: 100,
      y: 200,
      cell: 42,
      pinned: true,
      lock: false,
    },
    {
      i: 2,
      type: "battlefield",
      icon: "⚔",
      name: "Battle of the Ford",
      legend: "A decisive clash",
      x: 300,
      y: 400,
      cell: 88,
      pinned: false,
      lock: false,
    },
    {
      i: 3,
      type: "castle",
      icon: "🏰",
      name: null,
      legend: null,
      x: 500,
      y: 600,
      cell: 150,
      pinned: false,
      lock: true,
    },
  ];
}

function runtimeOf(markers: MarkerSummary[] | null): MarkersRuntime {
  return { readMarkers: () => markers };
}

describe("list_markers tool", () => {
  it("returns the full list by default", async () => {
    const markers = fakeMarkers();
    const tool = createListMarkersTool(runtimeOf(markers));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(3);
    expect(body.markers).toEqual(markers);
  });

  it("honors limit/offset", async () => {
    const markers = fakeMarkers();
    const tool = createListMarkersTool(runtimeOf(markers));
    const result = await tool.execute({ limit: 1, offset: 1 });
    const body = JSON.parse(result.content);
    expect(body.markers).toEqual(markers.slice(1, 2));
  });

  it("rejects invalid paging", async () => {
    const tool = createListMarkersTool(runtimeOf(fakeMarkers()));
    for (const bad of [{ limit: 0 }, { limit: 501 }, { limit: 1.5 }]) {
      expect((await tool.execute(bad)).isError).toBe(true);
    }
    for (const bad of [{ offset: -1 }, { offset: 1.5 }]) {
      expect((await tool.execute(bad)).isError).toBe(true);
    }
  });

  it("filters by type (case-insensitive)", async () => {
    const markers = fakeMarkers();
    const tool = createListMarkersTool(runtimeOf(markers));
    const result = await tool.execute({ type: "CASTLE" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.markers.every((m: MarkerSummary) => m.type === "castle")).toBe(
      true,
    );
    expect(body.filters.type).toBe("castle");
  });

  it("filters pinned_only", async () => {
    const markers = fakeMarkers();
    const tool = createListMarkersTool(runtimeOf(markers));
    const result = await tool.execute({ pinned_only: true });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.markers[0].pinned).toBe(true);
  });

  it("rejects invalid filter types", async () => {
    const tool = createListMarkersTool(runtimeOf(fakeMarkers()));
    expect((await tool.execute({ type: "" })).isError).toBe(true);
    expect((await tool.execute({ type: 42 })).isError).toBe(true);
    expect((await tool.execute({ pinned_only: "yes" })).isError).toBe(true);
  });

  it("errors when the map isn't ready", async () => {
    const tool = createListMarkersTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});

describe("readMarkersFromPack", () => {
  it("resolves name and legend from notes, keyed by marker{i}", () => {
    const pack: MarkerPackLike = {
      markers: [
        {
          i: 1,
          type: "castle",
          icon: "🏰",
          x: 10,
          y: 20,
          cell: 5,
          pinned: true,
          lock: false,
        },
        {
          i: 2,
          type: "mine",
          icon: "⛏",
          x: 30,
          y: 40,
          cell: 7,
        },
      ],
    };
    const notes = [
      { id: "marker1", name: "Rookhold", legend: "Ancient stronghold" },
      { id: "something-else", name: "Irrelevant" },
    ];
    const out = readMarkersFromPack(pack, notes);
    expect(out).toHaveLength(2);
    expect(out?.[0]).toMatchObject({
      i: 1,
      type: "castle",
      name: "Rookhold",
      legend: "Ancient stronghold",
      pinned: true,
    });
    expect(out?.[1]).toMatchObject({
      i: 2,
      type: "mine",
      name: null,
      legend: null,
    });
  });

  it("skips markers marked removed", () => {
    const pack: MarkerPackLike = {
      markers: [
        { i: 1, type: "castle" },
        { i: 2, type: "gone", removed: true },
      ],
    };
    const out = readMarkersFromPack(pack, []);
    expect(out).toHaveLength(1);
    expect(out?.[0].i).toBe(1);
  });

  it("returns null when pack/markers are missing", () => {
    expect(readMarkersFromPack(undefined, [])).toBeNull();
    expect(readMarkersFromPack({}, [])).toBeNull();
  });

  it("tolerates a missing notes array", () => {
    const pack: MarkerPackLike = { markers: [{ i: 1, type: "castle" }] };
    const out = readMarkersFromPack(pack, undefined);
    expect(out?.[0].name).toBeNull();
  });
});
