import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetEntityLockTool,
  defaultEntityLockRuntime,
  type EntityLockRef,
  type EntityLockRuntime,
  LOCKABLE_TYPES,
  type LockableEntityType,
  resolveLockableType,
} from "./set-entity-lock";

function makeRuntime(
  resolver: (
    type: LockableEntityType,
    ref: number | string,
  ) => EntityLockRef | null,
) {
  const find = vi.fn(resolver);
  const setLock = vi.fn<EntityLockRuntime["setLock"]>();
  const runtime: EntityLockRuntime = { find, setLock };
  return { runtime, find, setLock };
}

describe("set_entity_lock tool", () => {
  it("locks a state by numeric id", async () => {
    const { runtime, setLock } = makeRuntime((type, ref) =>
      type === "state" && ref === 1
        ? { type: "state", i: 1, name: "Altaria", previousLocked: false }
        : null,
    );
    const tool = createSetEntityLockTool(runtime);
    const result = await tool.execute({
      type: "state",
      entity: 1,
      locked: true,
    });
    expect(result.isError).toBeFalsy();
    expect(setLock).toHaveBeenCalledWith("state", 1, true);
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      type: "state",
      i: 1,
      name: "Altaria",
      locked: true,
      previousLocked: false,
      noop: false,
    });
  });

  it("unlocks a culture by name (case-insensitive type + ref)", async () => {
    const { runtime, setLock } = makeRuntime((type, ref) =>
      type === "culture" &&
      typeof ref === "string" &&
      ref.toLowerCase() === "highlanders"
        ? {
            type: "culture",
            i: 3,
            name: "Highlanders",
            previousLocked: true,
          }
        : null,
    );
    const tool = createSetEntityLockTool(runtime);
    await tool.execute({
      type: "CULTURES",
      entity: "HIGHLANDERS",
      locked: false,
    });
    expect(setLock).toHaveBeenCalledWith("culture", 3, false);
  });

  it("accepts every canonical type and common aliases", async () => {
    const { runtime, setLock } = makeRuntime((type, _ref) => ({
      type,
      i: 1,
      name: "X",
      previousLocked: false,
    }));
    const tool = createSetEntityLockTool(runtime);
    for (const t of [
      "state",
      "states",
      "burg",
      "city",
      "culture",
      "religion",
      "faith",
      "province",
      "provinces",
    ]) {
      setLock.mockClear();
      await tool.execute({ type: t, entity: 1, locked: true });
      expect(setLock).toHaveBeenCalled();
    }
  });

  it("rejects unknown type with a supported list", async () => {
    const { runtime, setLock } = makeRuntime(() => null);
    const tool = createSetEntityLockTool(runtime);
    const result = await tool.execute({
      type: "river",
      entity: 1,
      locked: true,
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.supported).toEqual([...LOCKABLE_TYPES]);
    expect(setLock).not.toHaveBeenCalled();
  });

  it("errors on unknown entity", async () => {
    const { runtime, setLock } = makeRuntime(() => null);
    const tool = createSetEntityLockTool(runtime);
    const result = await tool.execute({
      type: "state",
      entity: 999,
      locked: true,
    });
    expect(result.isError).toBe(true);
    expect(setLock).not.toHaveBeenCalled();
  });

  it("rejects non-boolean locked", async () => {
    const { runtime, setLock } = makeRuntime(() => ({
      type: "state",
      i: 1,
      name: "X",
      previousLocked: false,
    }));
    const tool = createSetEntityLockTool(runtime);
    for (const bad of ["true", 1, 0, null, undefined, {}]) {
      expect(
        (await tool.execute({ type: "state", entity: 1, locked: bad })).isError,
      ).toBe(true);
    }
    expect(setLock).not.toHaveBeenCalled();
  });

  it("is a no-op when already in the requested state", async () => {
    const { runtime, setLock } = makeRuntime(() => ({
      type: "state",
      i: 1,
      name: "Altaria",
      previousLocked: true,
    }));
    const tool = createSetEntityLockTool(runtime);
    const result = await tool.execute({
      type: "state",
      entity: 1,
      locked: true,
    });
    expect(result.isError).toBeFalsy();
    expect(setLock).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toMatchObject({
      noop: true,
      locked: true,
      previousLocked: true,
    });
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime(() => ({
      type: "state",
      i: 1,
      name: "X",
      previousLocked: false,
    }));
    runtime.setLock = vi.fn(() => {
      throw new Error("customization active");
    });
    const tool = createSetEntityLockTool(runtime);
    const result = await tool.execute({
      type: "state",
      entity: 1,
      locked: true,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/customization/);
  });

  it("rejects invalid ref types", async () => {
    const { runtime, setLock } = makeRuntime(() => null);
    const tool = createSetEntityLockTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      expect(
        (await tool.execute({ type: "state", entity: bad, locked: true }))
          .isError,
      ).toBe(true);
    }
    expect(setLock).not.toHaveBeenCalled();
  });
});

describe("resolveLockableType", () => {
  it("resolves canonical types and plurals", () => {
    expect(resolveLockableType("state")).toBe("state");
    expect(resolveLockableType("STATES")).toBe("state");
    expect(resolveLockableType("  burg  ")).toBe("burg");
    expect(resolveLockableType("cities")).toBe("burg");
    expect(resolveLockableType("faith")).toBe("religion");
    expect(resolveLockableType("provinces")).toBe("province");
  });
  it("returns null for unknown or invalid inputs", () => {
    expect(resolveLockableType("river")).toBeNull();
    expect(resolveLockableType("")).toBeNull();
    expect(resolveLockableType(42)).toBeNull();
  });
});

describe("defaultEntityLockRuntime dispatch", () => {
  let previous: unknown;
  beforeEach(() => {
    previous = (globalThis as { pack?: unknown }).pack;
  });
  afterEach(() => {
    if (previous === undefined) {
      delete (globalThis as { pack?: unknown }).pack;
    } else {
      (globalThis as { pack?: unknown }).pack = previous;
    }
  });

  it("finds + writes the correct collection per type", () => {
    (globalThis as { pack?: unknown }).pack = {
      states: [{ i: 0 }, { i: 1, name: "Altaria", lock: false }],
      burgs: [{ i: 0 }, { i: 1, name: "Stormport", lock: false }],
      cultures: [{ i: 0 }, { i: 1, name: "Highlanders", lock: true }],
      religions: [{ i: 0 }, { i: 1, name: "Old Faith", lock: false }],
      provinces: [{ i: 0 }, { i: 1, name: "Rookwood", lock: false }],
    };

    for (const type of LOCKABLE_TYPES) {
      const ref = defaultEntityLockRuntime.find(type, 1);
      expect(ref).toMatchObject({ type, i: 1 });
      defaultEntityLockRuntime.setLock(type, 1, true);
    }

    const pack = (globalThis as { pack: unknown }).pack as Record<
      string,
      Array<{ lock?: boolean }>
    >;
    expect(pack.states[1].lock).toBe(true);
    expect(pack.burgs[1].lock).toBe(true);
    expect(pack.cultures[1].lock).toBe(true);
    expect(pack.religions[1].lock).toBe(true);
    expect(pack.provinces[1].lock).toBe(true);
  });
});
