import { afterEach, describe, expect, it, vi } from "vitest";
import type { RawMarker, RawNote } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createRemoveAllMarkersTool,
  type RemoveAllMarkersRuntime,
  removeAllMarkersTool,
} from "./remove-all-markers";

interface Fixtures {
  getMarkers?: () => RawMarker[] | undefined;
  setMarkers?: (arr: RawMarker[]) => void;
  getNotes?: () => RawNote[] | undefined;
  setNotes?: (arr: RawNote[]) => void;
  removeDomNode?: (id: string) => void;
  addLines?: () => void;
  /** Default true. Set false to omit `addLines` from the runtime. */
  includeAddLines?: boolean;
}

function makeRuntime(f: Fixtures = {}) {
  const getMarkers = vi.fn<RemoveAllMarkersRuntime["getMarkers"]>(
    f.getMarkers ?? (() => []),
  );
  const setMarkers = vi.fn<RemoveAllMarkersRuntime["setMarkers"]>(
    f.setMarkers ?? (() => {}),
  );
  const getNotes = vi.fn<RemoveAllMarkersRuntime["getNotes"]>(
    f.getNotes ?? (() => []),
  );
  const setNotes = vi.fn<RemoveAllMarkersRuntime["setNotes"]>(
    f.setNotes ?? (() => {}),
  );
  const removeDomNode = vi.fn<RemoveAllMarkersRuntime["removeDomNode"]>(
    f.removeDomNode ?? (() => {}),
  );
  const addLines = vi.fn(f.addLines ?? (() => {}));
  const runtime: RemoveAllMarkersRuntime = {
    getMarkers,
    setMarkers,
    getNotes,
    setNotes,
    removeDomNode,
    ...(f.includeAddLines === false ? {} : { addLines }),
  };
  return {
    runtime,
    getMarkers,
    setMarkers,
    getNotes,
    setNotes,
    removeDomNode,
    addLines,
  };
}

describe("remove_all_markers tool", () => {
  it("removes 3 of 5 markers (2 locked) and reassigns pack.markers", async () => {
    const sourceMarkers: RawMarker[] = [
      { i: 1, lock: true },
      { i: 2 },
      { i: 3 },
      { i: 4, lock: true },
      { i: 7 },
    ];
    const sourceNotes: RawNote[] = [];
    const { runtime, setMarkers, removeDomNode, addLines } = makeRuntime({
      getMarkers: () => sourceMarkers,
      getNotes: () => sourceNotes,
    });
    const tool = createRemoveAllMarkersTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();

    expect(setMarkers).toHaveBeenCalledTimes(1);
    const passed = setMarkers.mock.calls[0][0];
    expect(passed).not.toBe(sourceMarkers); // identity-distinct: REASSIGNED
    expect(passed.map((m) => m.i)).toEqual([1, 4]);

    expect(removeDomNode.mock.calls.flat()).toEqual([
      "marker2",
      "marker3",
      "marker7",
    ]);
    expect(removeDomNode.mock.calls.flat()).not.toContain("marker1");
    expect(removeDomNode.mock.calls.flat()).not.toContain("marker4");

    expect(addLines).toHaveBeenCalledTimes(1);

    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 5,
      removed_count: 3,
      kept_count: 2,
      removed_marker_ids: [2, 3, 7],
      removed_marker_ids_truncated: false,
    });
  });

  it("does not touch DOM for locked markers", async () => {
    const { runtime, removeDomNode } = makeRuntime({
      getMarkers: () => [{ i: 1, lock: true }, { i: 2 }, { i: 3, lock: true }],
    });
    const tool = createRemoveAllMarkersTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(removeDomNode.mock.calls).toEqual([["marker2"]]);
  });

  it("prunes notes whose id matches removed markers and reassigns notes", async () => {
    const sourceNotes: RawNote[] = [
      { id: "marker1", legend: "keeps" },
      { id: "marker3", legend: "goes" },
      { id: "markerX", legend: "unrelated" },
    ];
    const { runtime, setNotes } = makeRuntime({
      getMarkers: () => [{ i: 1, lock: true }, { i: 3 }],
      getNotes: () => sourceNotes,
    });
    const tool = createRemoveAllMarkersTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();

    expect(setNotes).toHaveBeenCalledTimes(1);
    const passed = setNotes.mock.calls[0][0];
    expect(passed).not.toBe(sourceNotes); // identity-distinct: REASSIGNED
    expect(passed.map((n) => n.id)).toEqual(["marker1", "markerX"]);
  });

  it("skips setNotes when nothing was removed (all locked); still reassigns markers", async () => {
    const sourceMarkers: RawMarker[] = [
      { i: 1, lock: true },
      { i: 2, lock: true },
    ];
    const { runtime, setMarkers, setNotes, addLines } = makeRuntime({
      getMarkers: () => sourceMarkers,
      getNotes: () => [{ id: "marker1" }, { id: "markerX" }],
    });
    const tool = createRemoveAllMarkersTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();

    expect(setNotes).not.toHaveBeenCalled();

    expect(setMarkers).toHaveBeenCalledTimes(1);
    const passed = setMarkers.mock.calls[0][0];
    expect(passed).not.toBe(sourceMarkers); // still reassigned even when noop
    expect(passed.map((m) => m.i)).toEqual([1, 2]);

    expect(addLines).toHaveBeenCalledTimes(1);
  });

  it("returns zero counts when all markers are locked, addLines still called", async () => {
    const { runtime, removeDomNode } = makeRuntime({
      getMarkers: () => [
        { i: 1, lock: true },
        { i: 2, lock: true },
      ],
    });
    const tool = createRemoveAllMarkersTool(runtime);

    const result = await tool.execute({});
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 2,
      removed_count: 0,
      kept_count: 2,
      removed_marker_ids: [],
      removed_marker_ids_truncated: false,
    });
    expect(removeDomNode).not.toHaveBeenCalled();
  });

  it("removes all markers when none are locked", async () => {
    const { runtime, setMarkers } = makeRuntime({
      getMarkers: () => [{ i: 1 }, { i: 2 }, { i: 3 }],
    });
    const tool = createRemoveAllMarkersTool(runtime);

    const result = await tool.execute({});
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 3,
      removed_count: 3,
      kept_count: 0,
      removed_marker_ids: [1, 2, 3],
      removed_marker_ids_truncated: false,
    });
    expect(setMarkers.mock.calls[0][0]).toEqual([]);
  });

  it("handles empty markers array (still reassigns)", async () => {
    const sourceMarkers: RawMarker[] = [];
    const { runtime, setMarkers, removeDomNode, setNotes } = makeRuntime({
      getMarkers: () => sourceMarkers,
    });
    const tool = createRemoveAllMarkersTool(runtime);

    const result = await tool.execute({});
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 0,
      removed_count: 0,
      kept_count: 0,
      removed_marker_ids: [],
      removed_marker_ids_truncated: false,
    });
    expect(setMarkers).toHaveBeenCalledTimes(1);
    const passed = setMarkers.mock.calls[0][0];
    expect(passed).not.toBe(sourceMarkers); // still identity-distinct
    expect(passed).toEqual([]);
    expect(removeDomNode).not.toHaveBeenCalled();
    expect(setNotes).not.toHaveBeenCalled();
  });

  it("errors when pack.markers is missing", async () => {
    const { runtime, setMarkers, setNotes, removeDomNode, addLines } =
      makeRuntime({ getMarkers: () => undefined });
    const tool = createRemoveAllMarkersTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.pack\.markers is not available/,
    );
    expect(setMarkers).not.toHaveBeenCalled();
    expect(setNotes).not.toHaveBeenCalled();
    expect(removeDomNode).not.toHaveBeenCalled();
    expect(addLines).not.toHaveBeenCalled();
  });

  it("errors when pack.markers is not an array", async () => {
    const { runtime } = makeRuntime({
      getMarkers: () => "oops" as unknown as RawMarker[],
    });
    const tool = createRemoveAllMarkersTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.pack\.markers is not available/,
    );
  });

  it("succeeds and skips setNotes when notes is missing", async () => {
    const { runtime, setMarkers, setNotes } = makeRuntime({
      getMarkers: () => [{ i: 5 }],
      getNotes: () => undefined,
    });
    const tool = createRemoveAllMarkersTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.removed_count).toBe(1);
    expect(body.removed_marker_ids).toEqual([5]);
    expect(setNotes).not.toHaveBeenCalled();
    expect(setMarkers).toHaveBeenCalledTimes(1);
  });

  it("caps removed_marker_ids at 50 and sets the truncated flag for 70 markers", async () => {
    const markers: RawMarker[] = Array.from({ length: 70 }, (_, k) => ({
      i: k + 1,
    }));
    const { runtime } = makeRuntime({ getMarkers: () => markers });
    const tool = createRemoveAllMarkersTool(runtime);

    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    expect(body.previous_count).toBe(70);
    expect(body.removed_count).toBe(70);
    expect(body.kept_count).toBe(0);
    expect(body.removed_marker_ids).toHaveLength(50);
    expect(body.removed_marker_ids[0]).toBe(1);
    expect(body.removed_marker_ids[49]).toBe(50);
    expect(body.removed_marker_ids_truncated).toBe(true);
  });

  it("does not truncate at the boundary (exactly 50 removals)", async () => {
    const markers: RawMarker[] = Array.from({ length: 50 }, (_, k) => ({
      i: k + 1,
    }));
    const { runtime } = makeRuntime({ getMarkers: () => markers });
    const tool = createRemoveAllMarkersTool(runtime);

    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    expect(body.removed_marker_ids).toHaveLength(50);
    expect(body.removed_marker_ids_truncated).toBe(false);
  });

  it("returns removed_marker_ids in ascending order regardless of input order", async () => {
    const { runtime } = makeRuntime({
      getMarkers: () => [{ i: 9 }, { i: 1 }, { i: 5 }, { i: 3 }, { i: 7 }],
    });
    const tool = createRemoveAllMarkersTool(runtime);

    const result = await tool.execute({});
    expect(JSON.parse(result.content).removed_marker_ids).toEqual([
      1, 3, 5, 7, 9,
    ]);
  });

  it("does not error when addLines is absent from the runtime", async () => {
    const { runtime } = makeRuntime({
      getMarkers: () => [{ i: 1 }],
      includeAddLines: false,
    });
    const tool = createRemoveAllMarkersTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
  });

  it("has the expected name + schema and round-trips through ToolRegistry", () => {
    expect(removeAllMarkersTool.name).toBe("remove_all_markers");
    expect(removeAllMarkersTool.input_schema).toEqual({
      type: "object",
      properties: {},
    });
    const reg = new ToolRegistry();
    reg.register(removeAllMarkersTool);
    expect(reg.list().map((t) => t.name)).toContain("remove_all_markers");
  });

  it("tolerates extraneous, null, and undefined input", async () => {
    const { runtime } = makeRuntime({ getMarkers: () => [] });
    const tool = createRemoveAllMarkersTool(runtime);

    const r1 = await tool.execute({ bogus: "value" });
    const r2 = await tool.execute(null);
    const r3 = await tool.execute(undefined);
    expect(r1.isError).toBeFalsy();
    expect(r2.isError).toBeFalsy();
    expect(r3.isError).toBeFalsy();
  });
});

interface FakeRemovableElement {
  remove(): void;
}

function makeFakeDocument(removed: string[]) {
  return {
    getElementById(id: string): FakeRemovableElement {
      return {
        remove() {
          removed.push(id);
        },
      };
    },
  };
}

describe("defaultRemoveAllMarkersRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNotes = (globalThis as { notes?: unknown }).notes;
  const originalAddLines = (globalThis as { addLines?: unknown }).addLines;
  const originalDocument = (globalThis as { document?: unknown }).document;

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { notes?: unknown }).notes = originalNotes;
    (globalThis as { addLines?: unknown }).addLines = originalAddLines;
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("end-to-end: reassigns pack.markers + notes, removes DOM, calls addLines", async () => {
    const pack = {
      markers: [
        { i: 1 },
        { i: 2, lock: true },
        { i: 3 },
        { i: 4 },
      ] as RawMarker[],
    };
    (globalThis as { pack?: unknown }).pack = pack;

    const initialNotes: RawNote[] = [
      { id: "marker1", legend: "L1" },
      { id: "marker3", legend: "L3" },
      { id: "markerX", legend: "unrelated" },
    ];
    (globalThis as { notes?: unknown }).notes = initialNotes;

    const removed: string[] = [];
    (globalThis as { document?: unknown }).document = makeFakeDocument(removed);

    const addLinesSpy = vi.fn();
    (globalThis as { addLines?: unknown }).addLines = addLinesSpy;

    const beforeMarkers = pack.markers;
    const beforeNotes = (globalThis as { notes: RawNote[] }).notes;

    const result = await removeAllMarkersTool.execute({});
    expect(result.isError).toBeFalsy();

    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 4,
      removed_count: 3,
      kept_count: 1,
      removed_marker_ids: [1, 3, 4],
      removed_marker_ids_truncated: false,
    });

    expect(pack.markers).not.toBe(beforeMarkers); // REASSIGNED
    expect(pack.markers).toHaveLength(1);
    expect(pack.markers[0].i).toBe(2);

    const notesAfter = (globalThis as { notes: RawNote[] }).notes;
    expect(notesAfter).not.toBe(beforeNotes); // REASSIGNED
    expect(notesAfter).toHaveLength(1);
    expect(notesAfter[0].id).toBe("markerX");

    expect(removed).toEqual(["marker1", "marker3", "marker4"]);
    expect(removed).not.toContain("marker2"); // locked DOM untouched

    expect(addLinesSpy).toHaveBeenCalledTimes(1);
  });

  it("survives addLines throwing — data mutations still applied", async () => {
    const pack = {
      markers: [{ i: 1 }, { i: 2, lock: true }] as RawMarker[],
    };
    (globalThis as { pack?: unknown }).pack = pack;
    (globalThis as { notes?: unknown }).notes = [
      { id: "marker1", legend: "L1" },
    ];
    (globalThis as { document?: unknown }).document = makeFakeDocument([]);
    (globalThis as { addLines?: unknown }).addLines = vi.fn(() => {
      throw new Error("boom");
    });

    const result = await removeAllMarkersTool.execute({});
    expect(result.isError).toBeFalsy();

    expect(pack.markers).toHaveLength(1);
    expect(pack.markers[0].i).toBe(2);
    const notesAfter = (globalThis as { notes: RawNote[] }).notes;
    expect(notesAfter).toHaveLength(0);
  });

  it("succeeds when addLines is absent", async () => {
    const pack = { markers: [{ i: 1 }] as RawMarker[] };
    (globalThis as { pack?: unknown }).pack = pack;
    (globalThis as { notes?: unknown }).notes = [];
    (globalThis as { document?: unknown }).document = makeFakeDocument([]);
    (globalThis as { addLines?: unknown }).addLines = undefined;

    const result = await removeAllMarkersTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(pack.markers).toHaveLength(0);
  });

  it("errors when pack.markers is missing — notes and DOM untouched", async () => {
    (globalThis as { pack?: unknown }).pack = {};
    const initialNotes: RawNote[] = [{ id: "marker1" }];
    (globalThis as { notes?: unknown }).notes = initialNotes;
    const removed: string[] = [];
    (globalThis as { document?: unknown }).document = makeFakeDocument(removed);

    const result = await removeAllMarkersTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.pack\.markers is not available/,
    );

    expect((globalThis as { notes: RawNote[] }).notes).toBe(initialNotes);
    expect((globalThis as { notes: RawNote[] }).notes).toHaveLength(1);
    expect(removed).toEqual([]);
  });

  it("succeeds when notes global is missing; markers still cleared", async () => {
    const pack = { markers: [{ i: 1 }] as RawMarker[] };
    (globalThis as { pack?: unknown }).pack = pack;
    (globalThis as { notes?: unknown }).notes = undefined;
    (globalThis as { document?: unknown }).document = makeFakeDocument([]);

    const result = await removeAllMarkersTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).removed_count).toBe(1);
    expect(pack.markers).toHaveLength(0);
    expect((globalThis as { notes?: unknown }).notes).toBeUndefined();
  });

  it("silently skips DOM removal when document is undefined", async () => {
    const pack = {
      markers: [{ i: 1 }, { i: 2, lock: true }] as RawMarker[],
    };
    (globalThis as { pack?: unknown }).pack = pack;
    (globalThis as { notes?: unknown }).notes = [];
    (globalThis as { document?: unknown }).document = undefined;

    const result = await removeAllMarkersTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).removed_count).toBe(1);
    expect(pack.markers).toHaveLength(1);
    expect(pack.markers[0].i).toBe(2);
  });

  it("swallows errors thrown by document element .remove()", async () => {
    const pack = { markers: [{ i: 1 }] as RawMarker[] };
    (globalThis as { pack?: unknown }).pack = pack;
    (globalThis as { notes?: unknown }).notes = [];
    (globalThis as { document?: unknown }).document = {
      getElementById() {
        return {
          remove() {
            throw new Error("svg gone");
          },
        };
      },
    };

    const result = await removeAllMarkersTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).removed_count).toBe(1);
    expect(pack.markers).toHaveLength(0);
  });
});
