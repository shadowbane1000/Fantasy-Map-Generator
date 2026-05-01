import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createToggleLockAllBurgsTool,
  type ToggleLockAllBurgsRuntime,
  toggleLockAllBurgsTool,
} from "./toggle-lock-all-burgs";

interface MakeRuntimeOpts {
  burgs?: RawBurg[] | undefined | unknown;
  addLines?: () => void;
  setLockAllIcon?: ((className: string) => void) | undefined;
  omitSetLockAllIcon?: boolean;
  getBurgsThrows?: Error;
  setLockThrows?: Error;
}

function makeRuntime(opts: MakeRuntimeOpts = {}) {
  const burgs = opts.burgs as RawBurg[] | undefined;
  const setLockAllIcon = opts.omitSetLockAllIcon
    ? undefined
    : vi.fn(opts.setLockAllIcon ?? (() => {}));
  const addLines = opts.addLines ? vi.fn(opts.addLines) : undefined;
  const getBurgs = vi.fn(() => {
    if (opts.getBurgsThrows) throw opts.getBurgsThrows;
    return burgs;
  });
  const setLock = vi.fn((i: number, lock: boolean) => {
    if (opts.setLockThrows) throw opts.setLockThrows;
    const arr = burgs as RawBurg[] | undefined;
    if (!Array.isArray(arr)) return;
    const burg = arr[i];
    if (!burg) return;
    burg.lock = lock;
  });
  const runtime: ToggleLockAllBurgsRuntime = {
    getBurgs,
    setLock,
    addLines,
    setLockAllIcon,
  };
  return { runtime, getBurgs, setLock, addLines, setLockAllIcon };
}

describe("toggle_lock_all_burgs tool", () => {
  it("happy path A: 3 burgs all locked → after: all unlocked", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, lock: true, name: "A" },
      { i: 2, lock: true, name: "B" },
      { i: 3, lock: true, name: "C" },
    ];
    const { runtime, setLockAllIcon } = makeRuntime({ burgs });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      active_count: 3,
      previously_all_locked: true,
      now_locked: 0,
      now_unlocked: 3,
      skipped_removed: 0,
    });
    expect(burgs[1].lock).toBe(false);
    expect(burgs[2].lock).toBe(false);
    expect(burgs[3].lock).toBe(false);
    expect(setLockAllIcon).toHaveBeenCalledTimes(1);
    expect(setLockAllIcon?.mock.calls[0][0]).toBe("icon-lock");
  });

  it("happy path B: partially locked → all locked", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, lock: true, name: "A" },
      { i: 2, lock: false, name: "B" },
      { i: 3, lock: true, name: "C" },
    ];
    const { runtime, setLockAllIcon } = makeRuntime({ burgs });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      active_count: 3,
      previously_all_locked: false,
      now_locked: 3,
      now_unlocked: 0,
      skipped_removed: 0,
    });
    expect(burgs[1].lock).toBe(true);
    expect(burgs[2].lock).toBe(true);
    expect(burgs[3].lock).toBe(true);
    expect(setLockAllIcon).toHaveBeenCalledTimes(1);
    expect(setLockAllIcon?.mock.calls[0][0]).toBe("icon-lock-open");
  });

  it("happy path C: all unlocked → all locked", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, lock: false, name: "A" },
      { i: 2, lock: false, name: "B" },
      { i: 3, lock: false, name: "C" },
    ];
    const { runtime, setLockAllIcon } = makeRuntime({ burgs });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      active_count: 3,
      previously_all_locked: false,
      now_locked: 3,
      now_unlocked: 0,
      skipped_removed: 0,
    });
    for (let i = 1; i <= 3; i++) {
      expect(burgs[i].lock).toBe(true);
    }
    expect(setLockAllIcon?.mock.calls[0][0]).toBe("icon-lock-open");
  });

  it("happy path D: mix of true/false/undefined → all locked", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, lock: true, name: "A" },
      { i: 2, lock: false, name: "B" },
      { i: 3, name: "C" },
    ];
    const { runtime } = makeRuntime({ burgs });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      active_count: 3,
      previously_all_locked: false,
      now_locked: 3,
      now_unlocked: 0,
      skipped_removed: 0,
    });
    for (let i = 1; i <= 3; i++) {
      expect(burgs[i].lock).toBe(true);
    }
  });

  it("removed burgs untouched (LOAD-BEARING)", async () => {
    // Pre-mutation `allLocked` is true (active burgs 1 + 3 are both locked).
    // Toggle direction is "unlock all". Removed burg starts at lock=true; if
    // it were touched, it would become false. The assertion that it stays
    // true is therefore load-bearing.
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, lock: true, name: "A" },
      { i: 2, lock: true, removed: true, name: "Removed" },
      { i: 3, lock: true, name: "C" },
    ];
    const { runtime, setLock } = makeRuntime({ burgs });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      active_count: 2,
      previously_all_locked: true,
      now_locked: 0,
      now_unlocked: 2,
      skipped_removed: 1,
    });
    // LOAD-BEARING: removed burg must stay lock=true.
    expect(burgs[2].lock).toBe(true);
    expect(burgs[2].removed).toBe(true);
    expect(burgs[1].lock).toBe(false);
    expect(burgs[3].lock).toBe(false);
    // setLock was called exactly twice — for burg 1 and burg 3.
    expect(setLock).toHaveBeenCalledTimes(2);
    expect(setLock).toHaveBeenCalledWith(1, false);
    expect(setLock).toHaveBeenCalledWith(3, false);
    expect(setLock).not.toHaveBeenCalledWith(2, expect.anything());
  });

  it("burg 0 untouched (LOAD-BEARING)", async () => {
    // Pre-mutation `allLocked` is true (active burgs are all locked).
    // Toggle direction is "unlock all". burg 0 starts at lock=true; if it
    // were touched, it would become false. The assertion that it stays
    // true is therefore load-bearing.
    const burgs: RawBurg[] = [
      { i: 0, lock: true },
      { i: 1, lock: true, name: "A" },
      { i: 2, lock: true, name: "B" },
    ];
    const { runtime, setLock } = makeRuntime({ burgs });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      active_count: 2,
      previously_all_locked: true,
      now_locked: 0,
      now_unlocked: 2,
      skipped_removed: 0,
    });
    // LOAD-BEARING: burg 0 must stay lock=true.
    expect(burgs[0].lock).toBe(true);
    expect(burgs[1].lock).toBe(false);
    expect(burgs[2].lock).toBe(false);
    expect(setLock).not.toHaveBeenCalledWith(0, expect.anything());
  });

  it("empty active set → vacuous true (LOAD-BEARING)", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, lock: true, removed: true },
      { i: 2, lock: false, removed: true },
    ];
    const { runtime, setLock, setLockAllIcon } = makeRuntime({ burgs });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      active_count: 0,
      previously_all_locked: true,
      now_locked: 0,
      now_unlocked: 0,
      skipped_removed: 2,
    });
    // Removed burgs untouched.
    expect(burgs[1].lock).toBe(true);
    expect(burgs[2].lock).toBe(false);
    expect(setLock).not.toHaveBeenCalled();
    // Vacuous-true → ternary returns "icon-lock".
    expect(setLockAllIcon).toHaveBeenCalledTimes(1);
    expect(setLockAllIcon?.mock.calls[0][0]).toBe("icon-lock");
  });

  it("in-place mutation: array + per-burg identity preserved (LOAD-BEARING)", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, lock: false, name: "A" },
      { i: 2, lock: true, name: "B" },
    ];
    const arrayBefore = burgs;
    const burg0Before = burgs[0];
    const burg1Before = burgs[1];
    const burg2Before = burgs[2];
    const { runtime } = makeRuntime({ burgs });
    const tool = createToggleLockAllBurgsTool(runtime);
    await tool.execute({});
    expect(burgs).toBe(arrayBefore);
    expect(burgs[0]).toBe(burg0Before);
    expect(burgs[1]).toBe(burg1Before);
    expect(burgs[2]).toBe(burg2Before);
  });

  it("missing pack.burgs → exact error", async () => {
    const { runtime, setLock, setLockAllIcon } = makeRuntime({
      burgs: undefined,
    });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.burgs is not available; the map hasn't finished loading.",
    );
    expect(setLock).not.toHaveBeenCalled();
    expect(setLockAllIcon).not.toHaveBeenCalled();
  });

  it("non-array pack.burgs → same error", async () => {
    const { runtime } = makeRuntime({
      burgs: "oops" as unknown as RawBurg[],
    });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.burgs is not available; the map hasn't finished loading.",
    );
  });

  it("getBurgs() throws → error propagated", async () => {
    const { runtime, setLock } = makeRuntime({
      getBurgsThrows: new Error("boom"),
    });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/boom/);
    expect(setLock).not.toHaveBeenCalled();
  });

  it("setLock throws → error propagated", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const { runtime } = makeRuntime({
      burgs,
      setLockThrows: new Error("dom!"),
    });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/dom!/);
  });

  it("addLines best-effort: not provided → no error", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const { runtime } = makeRuntime({ burgs });
    expect(runtime.addLines).toBeUndefined();
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
  });

  it("addLines throws → swallowed; result still ok; mutation applied", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const { runtime } = makeRuntime({
      burgs,
      addLines: () => {
        throw new Error("svg!");
      },
    });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(burgs[1].lock).toBe(true);
  });

  it("setLockAllIcon best-effort: not provided → no error", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const { runtime } = makeRuntime({ burgs, omitSetLockAllIcon: true });
    expect(runtime.setLockAllIcon).toBeUndefined();
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(burgs[1].lock).toBe(true);
  });

  it("setLockAllIcon throws → swallowed; result still ok; mutation applied", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const { runtime } = makeRuntime({
      burgs,
      setLockAllIcon: () => {
        throw new Error("dom!");
      },
    });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(burgs[1].lock).toBe(true);
  });

  it.each([
    {
      label: "all locked → unlock all",
      burgs: [
        { i: 0 },
        { i: 1, lock: true },
        { i: 2, lock: true },
      ] as RawBurg[],
      expectedClassName: "icon-lock",
    },
    {
      label: "partial → lock all",
      burgs: [
        { i: 0 },
        { i: 1, lock: true },
        { i: 2, lock: false },
      ] as RawBurg[],
      expectedClassName: "icon-lock-open",
    },
    {
      label: "all unlocked → lock all",
      burgs: [
        { i: 0 },
        { i: 1, lock: false },
        { i: 2, lock: false },
      ] as RawBurg[],
      expectedClassName: "icon-lock-open",
    },
    {
      label: "empty active → vacuous true → unlock all (no-op)",
      burgs: [{ i: 0 }] as RawBurg[],
      expectedClassName: "icon-lock",
    },
  ])("setLockAllIcon className matches PRE-mutation allLocked: $label", async ({
    burgs,
    expectedClassName,
  }) => {
    const { runtime, setLockAllIcon } = makeRuntime({ burgs });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(setLockAllIcon).toHaveBeenCalledTimes(1);
    expect(setLockAllIcon?.mock.calls[0][0]).toBe(expectedClassName);
  });

  it("tool name + schema + registry round-trip", () => {
    expect(toggleLockAllBurgsTool.name).toBe("toggle_lock_all_burgs");
    expect(toggleLockAllBurgsTool.input_schema).toEqual({
      type: "object",
      properties: {},
    });
    const reg = new ToolRegistry();
    reg.register(toggleLockAllBurgsTool);
    expect(reg.list().map((t) => t.name)).toContain("toggle_lock_all_burgs");
  });

  it("ignores extraneous input properties", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const { runtime } = makeRuntime({ burgs });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({ bogus: "x", count: 7 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.active_count).toBe(1);
  });

  it("tolerates null/undefined input", async () => {
    const burgs1: RawBurg[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const r1 = await createToggleLockAllBurgsTool(
      makeRuntime({ burgs: burgs1 }).runtime,
    ).execute(null);
    expect(r1.isError).toBeFalsy();

    const burgs2: RawBurg[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const r2 = await createToggleLockAllBurgsTool(
      makeRuntime({ burgs: burgs2 }).runtime,
    ).execute(undefined);
    expect(r2.isError).toBeFalsy();
  });

  it.each([
    {
      label: "happy A (all locked)",
      burgs: [
        { i: 0 },
        { i: 1, lock: true },
        { i: 2, lock: true },
        { i: 3, lock: true },
      ] as RawBurg[],
    },
    {
      label: "happy B (partial)",
      burgs: [
        { i: 0 },
        { i: 1, lock: true },
        { i: 2, lock: false },
        { i: 3, lock: true },
      ] as RawBurg[],
    },
    {
      label: "happy C (all unlocked)",
      burgs: [
        { i: 0 },
        { i: 1, lock: false },
        { i: 2, lock: false },
        { i: 3, lock: false },
      ] as RawBurg[],
    },
    {
      label: "happy D (mixed/undefined)",
      burgs: [
        { i: 0 },
        { i: 1, lock: true },
        { i: 2, lock: false },
        { i: 3 },
      ] as RawBurg[],
    },
    {
      label: "empty active",
      burgs: [{ i: 0 }] as RawBurg[],
    },
  ])("now_locked + now_unlocked === active_count: $label", async ({
    burgs,
  }) => {
    const { runtime } = makeRuntime({ burgs });
    const tool = createToggleLockAllBurgsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.now_locked + body.now_unlocked).toBe(body.active_count);
  });
});

interface FakeIconElement {
  className: string;
}

function installLockAllIcon(): {
  iconEl: FakeIconElement;
} {
  const iconEl: FakeIconElement = { className: "" };
  (globalThis as { document?: unknown }).document = {
    getElementById(id: string) {
      return id === "burgsLockAll" ? iconEl : null;
    },
  };
  return { iconEl };
}

describe("defaultToggleLockAllBurgsRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalAddLines = (globalThis as { burgsOverviewAddLines?: unknown })
    .burgsOverviewAddLines;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = undefined;
    (globalThis as { document?: unknown }).document = undefined;
    (globalThis as { burgsOverviewAddLines?: unknown }).burgsOverviewAddLines =
      undefined;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { burgsOverviewAddLines?: unknown }).burgsOverviewAddLines =
      originalAddLines;
  });

  it("end-to-end with populated globals", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, lock: false, name: "A" },
      { i: 2, lock: true, name: "B" },
      { i: 3, lock: true, removed: true, name: "Removed" },
    ];
    (globalThis as { pack?: unknown }).pack = { burgs };
    const { iconEl } = installLockAllIcon();
    const addLines = vi.fn();
    (globalThis as { burgsOverviewAddLines?: unknown }).burgsOverviewAddLines =
      addLines;
    const arrayBefore = burgs;

    const result = await toggleLockAllBurgsTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      active_count: 2,
      previously_all_locked: false,
      now_locked: 2,
      now_unlocked: 0,
      skipped_removed: 1,
    });
    const livePack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(livePack.burgs).toBe(arrayBefore);
    expect(livePack.burgs[1].lock).toBe(true);
    expect(livePack.burgs[2].lock).toBe(true);
    // Removed burg untouched.
    expect(livePack.burgs[3].lock).toBe(true);
    expect(livePack.burgs[3].removed).toBe(true);
    expect(iconEl.className).toBe("icon-lock-open");
    expect(addLines).toHaveBeenCalledTimes(1);
  });

  it("integration: all locked → all unlocked", async () => {
    const burgs: RawBurg[] = [
      { i: 0 },
      { i: 1, lock: true, name: "A" },
      { i: 2, lock: true, name: "B" },
    ];
    (globalThis as { pack?: unknown }).pack = { burgs };
    const { iconEl } = installLockAllIcon();

    const result = await toggleLockAllBurgsTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      active_count: 2,
      previously_all_locked: true,
      now_locked: 0,
      now_unlocked: 2,
      skipped_removed: 0,
    });
    expect(burgs[1].lock).toBe(false);
    expect(burgs[2].lock).toBe(false);
    expect(iconEl.className).toBe("icon-lock");
  });

  it("integration: missing pack → error, icon untouched, addLines not called", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const { iconEl } = installLockAllIcon();
    const addLines = vi.fn();
    (globalThis as { burgsOverviewAddLines?: unknown }).burgsOverviewAddLines =
      addLines;

    const result = await toggleLockAllBurgsTool.execute({});

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.pack\.burgs is not available/,
    );
    expect(iconEl.className).toBe("");
    expect(addLines).not.toHaveBeenCalled();
  });

  it("integration: pack.burgs not an array → same error", async () => {
    (globalThis as { pack?: unknown }).pack = { burgs: "nope" };
    installLockAllIcon();

    const result = await toggleLockAllBurgsTool.execute({});

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.pack\.burgs is not available/,
    );
  });

  it("integration: missing #burgsLockAll element → no error, mutation still happens", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    (globalThis as { pack?: unknown }).pack = { burgs };
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };

    const result = await toggleLockAllBurgsTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(burgs[1].lock).toBe(true);
  });

  it("integration: burgsOverviewAddLines global missing → no error", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    (globalThis as { pack?: unknown }).pack = { burgs };
    installLockAllIcon();
    (globalThis as { burgsOverviewAddLines?: unknown }).burgsOverviewAddLines =
      undefined;

    const result = await toggleLockAllBurgsTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(burgs[1].lock).toBe(true);
  });

  it("integration: document undefined (SSR-safe) → no error, mutation applied", async () => {
    const burgs: RawBurg[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    (globalThis as { pack?: unknown }).pack = { burgs };
    (globalThis as { document?: unknown }).document = undefined;

    const result = await toggleLockAllBurgsTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(burgs[1].lock).toBe(true);
  });

  it("integration: empty active set → vacuous true, no setLock calls", async () => {
    const burgs: RawBurg[] = [{ i: 0 }];
    (globalThis as { pack?: unknown }).pack = { burgs };
    const { iconEl } = installLockAllIcon();

    const result = await toggleLockAllBurgsTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      active_count: 0,
      previously_all_locked: true,
      now_locked: 0,
      now_unlocked: 0,
      skipped_removed: 0,
    });
    expect(iconEl.className).toBe("icon-lock");
  });
});
