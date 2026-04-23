import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRoute } from "./_shared";
import {
  createSetRouteLockTool,
  type RouteLockRef,
  type RouteLockRuntime,
  setRouteLockTool,
} from "./set-route-lock";

function makeRuntime(find: (ref: number | string) => RouteLockRef | null): {
  runtime: RouteLockRuntime;
  apply: ReturnType<typeof vi.fn<RouteLockRuntime["apply"]>>;
} {
  const apply = vi.fn<RouteLockRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_route_lock tool", () => {
  it("locks by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Silk Trail", previousLocked: false } : null,
    );
    const tool = createSetRouteLockTool(runtime);
    const result = await tool.execute({ route: 5, locked: true });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, true);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Silk Trail",
      locked: true,
      previousLocked: false,
      noop: false,
    });
  });

  it("unlocks by numeric id", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousLocked: true,
    }));
    const tool = createSetRouteLockTool(runtime);
    await tool.execute({ route: 5, locked: false });
    expect(apply).toHaveBeenCalledWith(5, false);
  });

  it("resolves by case-insensitive name", async () => {
    const find = vi.fn<RouteLockRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "silk trail"
        ? { i: 5, name: "Silk Trail", previousLocked: false }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetRouteLockTool(runtime);
    await tool.execute({ route: "SILK TRAIL", locked: true });
    expect(find).toHaveBeenCalledWith("SILK TRAIL");
    expect(apply).toHaveBeenCalledWith(5, true);
  });

  it("is a noop when already locked", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousLocked: true,
    }));
    const tool = createSetRouteLockTool(runtime);
    const result = await tool.execute({ route: 1, locked: true });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("is a noop when already unlocked", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousLocked: false,
    }));
    const tool = createSetRouteLockTool(runtime);
    const result = await tool.execute({ route: 1, locked: false });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("rejects non-boolean locked", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousLocked: false,
    }));
    const tool = createSetRouteLockTool(runtime);
    for (const bad of [null, undefined, "yes", 1, 0]) {
      const r = await tool.execute({ route: 1, locked: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid route refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRouteLockTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ route: bad, locked: true });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown route", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRouteLockTool(runtime);
    const result = await tool.execute({ route: 999, locked: true });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: RouteLockRuntime = {
      find: () => ({ i: 1, name: "x", previousLocked: false }),
      apply: vi.fn(() => {
        throw new Error("pack.routes is not available.");
      }),
    };
    const tool = createSetRouteLockTool(runtime);
    const result = await tool.execute({ route: 1, locked: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/routes/);
  });
});

describe("defaultRouteLockRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        { i: 1, name: "Silk Trail" },
        { i: 5, name: "Iron Passage", lock: true },
        { i: 9, name: "Gone", removed: true },
      ] satisfies RawRoute[],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("locks a route (writes lock: true)", async () => {
    const result = await setRouteLockTool.execute({
      route: 1,
      locked: true,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    const target = pack.routes.find((r) => r.i === 1);
    expect(target?.lock).toBe(true);
  });

  it("unlocks a route (deletes the key, not sets to false)", async () => {
    const result = await setRouteLockTool.execute({
      route: 5,
      locked: false,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    const target = pack.routes.find((r) => r.i === 5);
    expect(target).toBeTruthy();
    expect("lock" in (target as object)).toBe(false);
  });

  it("rejects a removed route (findRouteByRef skips it)", async () => {
    const result = await setRouteLockTool.execute({
      route: 9,
      locked: true,
    });
    expect(result.isError).toBe(true);
  });

  it("resolves by case-insensitive name", async () => {
    await setRouteLockTool.execute({
      route: "silk trail",
      locked: true,
    });
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    const target = pack.routes.find((r) => r.i === 1);
    expect(target?.lock).toBe(true);
  });
});
