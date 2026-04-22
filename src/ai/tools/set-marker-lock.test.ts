import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMarker, RawNote } from "./_shared";
import {
  createSetMarkerLockTool,
  type MarkerLockRef,
  type MarkerLockRuntime,
  setMarkerLockTool,
} from "./set-marker-lock";

function makeRuntime(find: (ref: number | string) => MarkerLockRef | null): {
  runtime: MarkerLockRuntime;
  setLock: ReturnType<typeof vi.fn<MarkerLockRuntime["setLock"]>>;
} {
  const setLock = vi.fn<MarkerLockRuntime["setLock"]>();
  return { runtime: { find, setLock }, setLock };
}

describe("set_marker_lock tool", () => {
  it("locks an unlocked marker", async () => {
    const { runtime, setLock } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Dragon Lair", previousLocked: false } : null,
    );
    const tool = createSetMarkerLockTool(runtime);
    const result = await tool.execute({ marker: 5, locked: true });
    expect(result.isError).toBeFalsy();
    expect(setLock).toHaveBeenCalledWith(5, true);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Dragon Lair",
      locked: true,
      previousLocked: false,
      noop: false,
    });
  });

  it("unlocks a locked marker", async () => {
    const { runtime, setLock } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousLocked: true,
    }));
    const tool = createSetMarkerLockTool(runtime);
    const result = await tool.execute({ marker: 5, locked: false });
    expect(result.isError).toBeFalsy();
    expect(setLock).toHaveBeenCalledWith(5, false);
    expect(JSON.parse(result.content).noop).toBe(false);
  });

  it("resolves by case-insensitive note name", async () => {
    const find = vi.fn<MarkerLockRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "dragon lair"
        ? { i: 5, name: "Dragon Lair", previousLocked: false }
        : null,
    );
    const { runtime, setLock } = makeRuntime(find);
    const tool = createSetMarkerLockTool(runtime);
    await tool.execute({ marker: "DRAGON LAIR", locked: true });
    expect(find).toHaveBeenCalledWith("DRAGON LAIR");
    expect(setLock).toHaveBeenCalledWith(5, true);
  });

  it("is a noop when already locked", async () => {
    const { runtime, setLock } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousLocked: true,
    }));
    const tool = createSetMarkerLockTool(runtime);
    const result = await tool.execute({ marker: 1, locked: true });
    expect(setLock).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("is a noop when already unlocked", async () => {
    const { runtime, setLock } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousLocked: false,
    }));
    const tool = createSetMarkerLockTool(runtime);
    const result = await tool.execute({ marker: 1, locked: false });
    expect(setLock).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("errors when the marker is unknown", async () => {
    const { runtime, setLock } = makeRuntime(() => null);
    const tool = createSetMarkerLockTool(runtime);
    const result = await tool.execute({ marker: 999, locked: true });
    expect(result.isError).toBe(true);
    expect(setLock).not.toHaveBeenCalled();
  });

  it("rejects invalid marker refs", async () => {
    const { runtime, setLock } = makeRuntime(() => null);
    const tool = createSetMarkerLockTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ marker: bad, locked: true });
      expect(r.isError).toBe(true);
    }
    expect(setLock).not.toHaveBeenCalled();
  });

  it("rejects non-boolean locked", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousLocked: false,
    }));
    const tool = createSetMarkerLockTool(runtime);
    const result = await tool.execute({ marker: 1, locked: "yes" });
    expect(result.isError).toBe(true);
  });

  it("surfaces runtime failures from setLock", async () => {
    const runtime: MarkerLockRuntime = {
      find: () => ({ i: 1, name: "x", previousLocked: false }),
      setLock: vi.fn(() => {
        throw new Error("pack.markers is not available.");
      }),
    };
    const tool = createSetMarkerLockTool(runtime);
    const result = await tool.execute({ marker: 1, locked: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.markers/);
  });
});

describe("defaultMarkerLockRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNotes = (globalThis as { notes?: unknown }).notes;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      markers: [{ i: 2, lock: true }, { i: 5 }, { i: 8 }] satisfies RawMarker[],
    };
    (globalThis as { notes?: unknown }).notes = [
      { id: "marker5", name: "Dragon Lair" },
    ] satisfies RawNote[];
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { notes?: unknown }).notes = originalNotes;
  });

  it("locks an unlocked marker by id", async () => {
    const result = await setMarkerLockTool.execute({
      marker: 5,
      locked: true,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.lock).toBe(true);
  });

  it("unlocks a locked marker by id (deletes the key)", async () => {
    const result = await setMarkerLockTool.execute({
      marker: 2,
      locked: false,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[0]).not.toHaveProperty("lock");
  });

  it("resolves by note name", async () => {
    await setMarkerLockTool.execute({
      marker: "dragon lair",
      locked: true,
    });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.lock).toBe(true);
  });

  it("is a noop when already locked — marker unchanged", async () => {
    const result = await setMarkerLockTool.execute({
      marker: 2,
      locked: true,
    });
    expect(JSON.parse(result.content).noop).toBe(true);
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[0]).toEqual({ i: 2, lock: true });
  });
});
