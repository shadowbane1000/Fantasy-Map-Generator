import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawState } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createToggleLockAllStatesTool,
  type ToggleLockAllStatesRuntime,
  toggleLockAllStatesTool,
} from "./toggle-lock-all-states";

interface MakeRuntimeOpts {
  states?: RawState[] | undefined | unknown;
  addLines?: () => void;
  setLockAllIcon?: ((className: string) => void) | undefined;
  omitSetLockAllIcon?: boolean;
  getStatesThrows?: Error;
  setLockThrows?: Error;
}

function makeRuntime(opts: MakeRuntimeOpts = {}) {
  const states = opts.states as RawState[] | undefined;
  const setLockAllIcon = opts.omitSetLockAllIcon
    ? undefined
    : vi.fn(opts.setLockAllIcon ?? (() => {}));
  const addLines = opts.addLines ? vi.fn(opts.addLines) : undefined;
  const getStates = vi.fn(() => {
    if (opts.getStatesThrows) throw opts.getStatesThrows;
    return states;
  });
  const setLock = vi.fn((i: number, lock: boolean) => {
    if (opts.setLockThrows) throw opts.setLockThrows;
    const arr = states as RawState[] | undefined;
    if (!Array.isArray(arr)) return;
    const state = arr[i];
    if (!state) return;
    state.lock = lock;
  });
  const runtime: ToggleLockAllStatesRuntime = {
    getStates,
    setLock,
    addLines,
    setLockAllIcon,
  };
  return { runtime, getStates, setLock, addLines, setLockAllIcon };
}

describe("toggle_lock_all_states tool", () => {
  it("happy path A: 3 states all locked → after: all unlocked", async () => {
    const states: RawState[] = [
      { i: 0 },
      { i: 1, lock: true, name: "A" },
      { i: 2, lock: true, name: "B" },
      { i: 3, lock: true, name: "C" },
    ];
    const { runtime, setLockAllIcon } = makeRuntime({ states });
    const tool = createToggleLockAllStatesTool(runtime);
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
    expect(states[1].lock).toBe(false);
    expect(states[2].lock).toBe(false);
    expect(states[3].lock).toBe(false);
    expect(setLockAllIcon).toHaveBeenCalledTimes(1);
    expect(setLockAllIcon?.mock.calls[0][0]).toBe("icon-lock");
  });

  it("happy path B: partially locked → all locked", async () => {
    const states: RawState[] = [
      { i: 0 },
      { i: 1, lock: true, name: "A" },
      { i: 2, lock: false, name: "B" },
      { i: 3, lock: true, name: "C" },
    ];
    const { runtime, setLockAllIcon } = makeRuntime({ states });
    const tool = createToggleLockAllStatesTool(runtime);
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
    expect(states[1].lock).toBe(true);
    expect(states[2].lock).toBe(true);
    expect(states[3].lock).toBe(true);
    expect(setLockAllIcon).toHaveBeenCalledTimes(1);
    expect(setLockAllIcon?.mock.calls[0][0]).toBe("icon-lock-open");
  });

  it("happy path C: all unlocked → all locked", async () => {
    const states: RawState[] = [
      { i: 0 },
      { i: 1, lock: false, name: "A" },
      { i: 2, lock: false, name: "B" },
      { i: 3, lock: false, name: "C" },
    ];
    const { runtime, setLockAllIcon } = makeRuntime({ states });
    const tool = createToggleLockAllStatesTool(runtime);
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
      expect(states[i].lock).toBe(true);
    }
    expect(setLockAllIcon?.mock.calls[0][0]).toBe("icon-lock-open");
  });

  it("happy path D: mix of true/false/undefined → all locked", async () => {
    const states: RawState[] = [
      { i: 0 },
      { i: 1, lock: true, name: "A" },
      { i: 2, lock: false, name: "B" },
      { i: 3, name: "C" },
    ];
    const { runtime } = makeRuntime({ states });
    const tool = createToggleLockAllStatesTool(runtime);
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
      expect(states[i].lock).toBe(true);
    }
  });

  it("removed states untouched (LOAD-BEARING)", async () => {
    // Pre-mutation `allLocked` is true (active states 1 + 3 are both locked).
    // Toggle direction is "unlock all". Removed state starts at lock=true; if
    // it were touched, it would become false. The assertion that it stays
    // true is therefore load-bearing.
    const states: RawState[] = [
      { i: 0 },
      { i: 1, lock: true, name: "A" },
      { i: 2, lock: true, removed: true, name: "Removed" },
      { i: 3, lock: true, name: "C" },
    ];
    const { runtime, setLock } = makeRuntime({ states });
    const tool = createToggleLockAllStatesTool(runtime);
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
    // LOAD-BEARING: removed state must stay lock=true.
    expect(states[2].lock).toBe(true);
    expect(states[2].removed).toBe(true);
    expect(states[1].lock).toBe(false);
    expect(states[3].lock).toBe(false);
    // setLock was called exactly twice — for state 1 and state 3.
    expect(setLock).toHaveBeenCalledTimes(2);
    expect(setLock).toHaveBeenCalledWith(1, false);
    expect(setLock).toHaveBeenCalledWith(3, false);
    expect(setLock).not.toHaveBeenCalledWith(2, expect.anything());
  });

  it("state 0 (neutral) untouched (LOAD-BEARING)", async () => {
    // Pre-mutation `allLocked` is true (active states are all locked).
    // Toggle direction is "unlock all". state 0 starts at lock=true; if it
    // were touched, it would become false. The assertion that it stays
    // true is therefore load-bearing.
    const states: RawState[] = [
      { i: 0, lock: true, name: "Neutrals" },
      { i: 1, lock: true, name: "A" },
      { i: 2, lock: true, name: "B" },
    ];
    const { runtime, setLock } = makeRuntime({ states });
    const tool = createToggleLockAllStatesTool(runtime);
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
    // LOAD-BEARING: state 0 must stay lock=true.
    expect(states[0].lock).toBe(true);
    expect(states[1].lock).toBe(false);
    expect(states[2].lock).toBe(false);
    expect(setLock).not.toHaveBeenCalledWith(0, expect.anything());
  });

  it("empty active set → vacuous true (LOAD-BEARING)", async () => {
    const states: RawState[] = [
      { i: 0 },
      { i: 1, lock: true, removed: true },
      { i: 2, lock: false, removed: true },
    ];
    const { runtime, setLock, setLockAllIcon } = makeRuntime({ states });
    const tool = createToggleLockAllStatesTool(runtime);
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
    // Removed states untouched.
    expect(states[1].lock).toBe(true);
    expect(states[2].lock).toBe(false);
    expect(setLock).not.toHaveBeenCalled();
    // Vacuous-true → ternary returns "icon-lock".
    expect(setLockAllIcon).toHaveBeenCalledTimes(1);
    expect(setLockAllIcon?.mock.calls[0][0]).toBe("icon-lock");
  });

  it("in-place mutation: array + per-state identity preserved (LOAD-BEARING)", async () => {
    const states: RawState[] = [
      { i: 0 },
      { i: 1, lock: false, name: "A" },
      { i: 2, lock: true, name: "B" },
    ];
    const arrayBefore = states;
    const state0Before = states[0];
    const state1Before = states[1];
    const state2Before = states[2];
    const { runtime } = makeRuntime({ states });
    const tool = createToggleLockAllStatesTool(runtime);
    await tool.execute({});
    expect(states).toBe(arrayBefore);
    expect(states[0]).toBe(state0Before);
    expect(states[1]).toBe(state1Before);
    expect(states[2]).toBe(state2Before);
  });

  it("missing pack.states → exact error", async () => {
    const { runtime, setLock, setLockAllIcon } = makeRuntime({
      states: undefined,
    });
    const tool = createToggleLockAllStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.states is not available; the map hasn't finished loading.",
    );
    expect(setLock).not.toHaveBeenCalled();
    expect(setLockAllIcon).not.toHaveBeenCalled();
  });

  it("non-array pack.states → same error", async () => {
    const { runtime } = makeRuntime({
      states: "oops" as unknown as RawState[],
    });
    const tool = createToggleLockAllStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.states is not available; the map hasn't finished loading.",
    );
  });

  it("getStates() throws → error propagated", async () => {
    const { runtime, setLock } = makeRuntime({
      getStatesThrows: new Error("boom"),
    });
    const tool = createToggleLockAllStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/boom/);
    expect(setLock).not.toHaveBeenCalled();
  });

  it("setLock throws → error propagated", async () => {
    const states: RawState[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const { runtime } = makeRuntime({
      states,
      setLockThrows: new Error("dom!"),
    });
    const tool = createToggleLockAllStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/dom!/);
  });

  it("addLines best-effort: not provided → no error", async () => {
    const states: RawState[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const { runtime } = makeRuntime({ states });
    expect(runtime.addLines).toBeUndefined();
    const tool = createToggleLockAllStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
  });

  it("addLines throws → swallowed; result still ok; mutation applied", async () => {
    const states: RawState[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const { runtime } = makeRuntime({
      states,
      addLines: () => {
        throw new Error("svg!");
      },
    });
    const tool = createToggleLockAllStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(states[1].lock).toBe(true);
  });

  it("setLockAllIcon best-effort: not provided → no error", async () => {
    const states: RawState[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const { runtime } = makeRuntime({ states, omitSetLockAllIcon: true });
    expect(runtime.setLockAllIcon).toBeUndefined();
    const tool = createToggleLockAllStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(states[1].lock).toBe(true);
  });

  it("setLockAllIcon throws → swallowed; result still ok; mutation applied", async () => {
    const states: RawState[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const { runtime } = makeRuntime({
      states,
      setLockAllIcon: () => {
        throw new Error("dom!");
      },
    });
    const tool = createToggleLockAllStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(states[1].lock).toBe(true);
  });

  it.each([
    {
      label: "all locked → unlock all",
      states: [
        { i: 0 },
        { i: 1, lock: true },
        { i: 2, lock: true },
      ] as RawState[],
      expectedClassName: "icon-lock",
    },
    {
      label: "partial → lock all",
      states: [
        { i: 0 },
        { i: 1, lock: true },
        { i: 2, lock: false },
      ] as RawState[],
      expectedClassName: "icon-lock-open",
    },
    {
      label: "all unlocked → lock all",
      states: [
        { i: 0 },
        { i: 1, lock: false },
        { i: 2, lock: false },
      ] as RawState[],
      expectedClassName: "icon-lock-open",
    },
    {
      label: "empty active → vacuous true → unlock all (no-op)",
      states: [{ i: 0 }] as RawState[],
      expectedClassName: "icon-lock",
    },
  ])("setLockAllIcon className matches PRE-mutation allLocked: $label", async ({
    states,
    expectedClassName,
  }) => {
    const { runtime, setLockAllIcon } = makeRuntime({ states });
    const tool = createToggleLockAllStatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(setLockAllIcon).toHaveBeenCalledTimes(1);
    expect(setLockAllIcon?.mock.calls[0][0]).toBe(expectedClassName);
  });

  it("tool name + schema + registry round-trip", () => {
    expect(toggleLockAllStatesTool.name).toBe("toggle_lock_all_states");
    expect(toggleLockAllStatesTool.input_schema).toEqual({
      type: "object",
      properties: {},
    });
    const reg = new ToolRegistry();
    reg.register(toggleLockAllStatesTool);
    expect(reg.list().map((t) => t.name)).toContain("toggle_lock_all_states");
  });

  it("ignores extraneous input properties", async () => {
    const states: RawState[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const { runtime } = makeRuntime({ states });
    const tool = createToggleLockAllStatesTool(runtime);
    const result = await tool.execute({ bogus: "x", count: 7 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.active_count).toBe(1);
  });

  it("tolerates null/undefined input", async () => {
    const states1: RawState[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const r1 = await createToggleLockAllStatesTool(
      makeRuntime({ states: states1 }).runtime,
    ).execute(null);
    expect(r1.isError).toBeFalsy();

    const states2: RawState[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    const r2 = await createToggleLockAllStatesTool(
      makeRuntime({ states: states2 }).runtime,
    ).execute(undefined);
    expect(r2.isError).toBeFalsy();
  });

  it.each([
    {
      label: "happy A (all locked)",
      states: [
        { i: 0 },
        { i: 1, lock: true },
        { i: 2, lock: true },
        { i: 3, lock: true },
      ] as RawState[],
    },
    {
      label: "happy B (partial)",
      states: [
        { i: 0 },
        { i: 1, lock: true },
        { i: 2, lock: false },
        { i: 3, lock: true },
      ] as RawState[],
    },
    {
      label: "happy C (all unlocked)",
      states: [
        { i: 0 },
        { i: 1, lock: false },
        { i: 2, lock: false },
        { i: 3, lock: false },
      ] as RawState[],
    },
    {
      label: "happy D (mixed/undefined)",
      states: [
        { i: 0 },
        { i: 1, lock: true },
        { i: 2, lock: false },
        { i: 3 },
      ] as RawState[],
    },
    {
      label: "empty active",
      states: [{ i: 0 }] as RawState[],
    },
  ])("now_locked + now_unlocked === active_count: $label", async ({
    states,
  }) => {
    const { runtime } = makeRuntime({ states });
    const tool = createToggleLockAllStatesTool(runtime);
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
      return id === "statesLockAll" ? iconEl : null;
    },
  };
  return { iconEl };
}

describe("defaultToggleLockAllStatesRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalAddLines = (globalThis as { statesEditorAddLines?: unknown })
    .statesEditorAddLines;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = undefined;
    (globalThis as { document?: unknown }).document = undefined;
    (globalThis as { statesEditorAddLines?: unknown }).statesEditorAddLines =
      undefined;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { statesEditorAddLines?: unknown }).statesEditorAddLines =
      originalAddLines;
  });

  it("end-to-end with populated globals", async () => {
    const states: RawState[] = [
      { i: 0 },
      { i: 1, lock: false, name: "A" },
      { i: 2, lock: true, name: "B" },
      { i: 3, lock: true, removed: true, name: "Removed" },
    ];
    (globalThis as { pack?: unknown }).pack = { states };
    const { iconEl } = installLockAllIcon();
    const addLines = vi.fn();
    (globalThis as { statesEditorAddLines?: unknown }).statesEditorAddLines =
      addLines;
    const arrayBefore = states;

    const result = await toggleLockAllStatesTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      active_count: 2,
      previously_all_locked: false,
      now_locked: 2,
      now_unlocked: 0,
      skipped_removed: 1,
    });
    const livePack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(livePack.states).toBe(arrayBefore);
    expect(livePack.states[1].lock).toBe(true);
    expect(livePack.states[2].lock).toBe(true);
    // Removed state untouched.
    expect(livePack.states[3].lock).toBe(true);
    expect(livePack.states[3].removed).toBe(true);
    expect(iconEl.className).toBe("icon-lock-open");
    expect(addLines).toHaveBeenCalledTimes(1);
  });

  it("integration: all locked → all unlocked", async () => {
    const states: RawState[] = [
      { i: 0 },
      { i: 1, lock: true, name: "A" },
      { i: 2, lock: true, name: "B" },
    ];
    (globalThis as { pack?: unknown }).pack = { states };
    const { iconEl } = installLockAllIcon();

    const result = await toggleLockAllStatesTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      active_count: 2,
      previously_all_locked: true,
      now_locked: 0,
      now_unlocked: 2,
      skipped_removed: 0,
    });
    expect(states[1].lock).toBe(false);
    expect(states[2].lock).toBe(false);
    expect(iconEl.className).toBe("icon-lock");
  });

  it("integration: missing pack → error, icon untouched, addLines not called", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const { iconEl } = installLockAllIcon();
    const addLines = vi.fn();
    (globalThis as { statesEditorAddLines?: unknown }).statesEditorAddLines =
      addLines;

    const result = await toggleLockAllStatesTool.execute({});

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.pack\.states is not available/,
    );
    expect(iconEl.className).toBe("");
    expect(addLines).not.toHaveBeenCalled();
  });

  it("integration: pack.states not an array → same error", async () => {
    (globalThis as { pack?: unknown }).pack = { states: "nope" };
    installLockAllIcon();

    const result = await toggleLockAllStatesTool.execute({});

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.pack\.states is not available/,
    );
  });

  it("integration: missing #statesLockAll element → no error, mutation still happens", async () => {
    const states: RawState[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    (globalThis as { pack?: unknown }).pack = { states };
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };

    const result = await toggleLockAllStatesTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(states[1].lock).toBe(true);
  });

  it("integration: statesEditorAddLines global missing → no error", async () => {
    const states: RawState[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    (globalThis as { pack?: unknown }).pack = { states };
    installLockAllIcon();
    (globalThis as { statesEditorAddLines?: unknown }).statesEditorAddLines =
      undefined;

    const result = await toggleLockAllStatesTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(states[1].lock).toBe(true);
  });

  it("integration: document undefined (SSR-safe) → no error, mutation applied", async () => {
    const states: RawState[] = [{ i: 0 }, { i: 1, lock: false, name: "A" }];
    (globalThis as { pack?: unknown }).pack = { states };
    (globalThis as { document?: unknown }).document = undefined;

    const result = await toggleLockAllStatesTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(states[1].lock).toBe(true);
  });

  it("integration: empty active set → vacuous true, no setLock calls", async () => {
    const states: RawState[] = [{ i: 0 }];
    (globalThis as { pack?: unknown }).pack = { states };
    const { iconEl } = installLockAllIcon();

    const result = await toggleLockAllStatesTool.execute({});

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
