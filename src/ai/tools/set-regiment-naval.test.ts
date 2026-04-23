import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRegiment } from "./_shared";
import {
  createSetRegimentNavalTool,
  type RegimentNavalRef,
  type RegimentNavalRuntime,
  setRegimentNavalTool,
} from "./set-regiment-naval";

function makeRuntime(
  find: (
    stateRef: number | string,
    regRef: number | string,
  ) => RegimentNavalRef | null,
): {
  runtime: RegimentNavalRuntime;
  apply: ReturnType<typeof vi.fn<RegimentNavalRuntime["apply"]>>;
} {
  const apply = vi.fn<RegimentNavalRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_regiment_naval tool", () => {
  it("sets naval=true by numeric ids", async () => {
    const { runtime, apply } = makeRuntime((stateRef, regRef) =>
      stateRef === 1 && regRef === 2
        ? {
            stateId: 1,
            stateName: "Altaria",
            i: 2,
            name: "2nd Rookhold Regiment",
            previousNaval: false,
          }
        : null,
    );
    const tool = createSetRegimentNavalTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 2,
      naval: true,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 2, true);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      stateId: 1,
      stateName: "Altaria",
      i: 2,
      name: "2nd Rookhold Regiment",
      naval: true,
      previousNaval: false,
      noop: false,
    });
  });

  it("resolves by case-insensitive state + regiment names", async () => {
    const find = vi.fn<RegimentNavalRuntime["find"]>((sRef, rRef) =>
      typeof sRef === "string" &&
      sRef.toLowerCase() === "altaria" &&
      typeof rRef === "string" &&
      rRef.toLowerCase() === "2nd rookhold regiment"
        ? {
            stateId: 1,
            stateName: "Altaria",
            i: 2,
            name: "2nd Rookhold Regiment",
            previousNaval: false,
          }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetRegimentNavalTool(runtime);
    await tool.execute({
      state: "ALTARIA",
      regiment: "2nd Rookhold Regiment",
      naval: true,
    });
    expect(find).toHaveBeenCalledWith("ALTARIA", "2nd Rookhold Regiment");
    expect(apply).toHaveBeenCalledWith(1, 2, true);
  });

  it("flips naval → land", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      stateId: 1,
      stateName: "Altaria",
      i: 2,
      name: "x",
      previousNaval: true,
    }));
    const tool = createSetRegimentNavalTool(runtime);
    await tool.execute({ state: 1, regiment: 2, naval: false });
    expect(apply).toHaveBeenCalledWith(1, 2, false);
  });

  it("is a noop when already naval", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      stateId: 1,
      stateName: "x",
      i: 2,
      name: "y",
      previousNaval: true,
    }));
    const tool = createSetRegimentNavalTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 2, naval: true });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("is a noop when already land", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      stateId: 1,
      stateName: "x",
      i: 2,
      name: "y",
      previousNaval: false,
    }));
    const tool = createSetRegimentNavalTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 2, naval: false });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("rejects non-boolean naval", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      stateId: 1,
      stateName: "x",
      i: 2,
      name: "y",
      previousNaval: false,
    }));
    const tool = createSetRegimentNavalTool(runtime);
    for (const bad of [null, undefined, "yes", 1, 0]) {
      const r = await tool.execute({ state: 1, regiment: 2, naval: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid state refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRegimentNavalTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: bad, regiment: 2, naval: true });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid regiment refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRegimentNavalTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: 1, regiment: bad, naval: true });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown regiment", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRegimentNavalTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 999,
      naval: true,
    });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: RegimentNavalRuntime = {
      find: () => ({
        stateId: 1,
        stateName: "x",
        i: 2,
        name: "y",
        previousNaval: false,
      }),
      apply: vi.fn(() => {
        throw new Error("State 1 not found.");
      }),
    };
    const tool = createSetRegimentNavalTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 2, naval: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/State/);
  });
});

describe("defaultRegimentNavalRuntime (integration)", () => {
  const drawMock = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDraw = (globalThis as { drawMilitary?: unknown }).drawMilitary;

  beforeEach(() => {
    drawMock.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals" },
        {
          i: 1,
          name: "Altaria",
          military: [
            { i: 1, name: "1st Regiment", n: 0 },
            { i: 2, name: "2nd Regiment", n: 1 },
          ] satisfies RawRegiment[],
        },
      ],
    };
    (globalThis as { drawMilitary?: unknown }).drawMilitary = drawMock;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { drawMilitary?: unknown }).drawMilitary = originalDraw;
  });

  it("writes reg.n = 1 on a land regiment and calls drawMilitary once", async () => {
    const result = await setRegimentNavalTool.execute({
      state: 1,
      regiment: 1,
      naval: true,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { states: { i: number; military?: RawRegiment[] }[] };
      }
    ).pack;
    const reg = pack.states[1]?.military?.find((r) => r.i === 1);
    expect(reg?.n).toBe(1);
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("writes reg.n = 0 on a naval regiment", async () => {
    const result = await setRegimentNavalTool.execute({
      state: "Altaria",
      regiment: 2,
      naval: false,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { states: { i: number; military?: RawRegiment[] }[] };
      }
    ).pack;
    const reg = pack.states[1]?.military?.find((r) => r.i === 2);
    expect(reg?.n).toBe(0);
  });

  it("succeeds when drawMilitary is missing", async () => {
    (globalThis as { drawMilitary?: unknown }).drawMilitary = undefined;
    const result = await setRegimentNavalTool.execute({
      state: 1,
      regiment: 1,
      naval: true,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { states: { i: number; military?: RawRegiment[] }[] };
      }
    ).pack;
    const reg = pack.states[1]?.military?.find((r) => r.i === 1);
    expect(reg?.n).toBe(1);
  });
});
