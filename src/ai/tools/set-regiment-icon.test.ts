import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRegiment } from "./_shared";
import {
  createSetRegimentIconTool,
  type RegimentIconRef,
  type RegimentIconRuntime,
  setRegimentIconTool,
} from "./set-regiment-icon";

function makeRuntime(
  find: (
    stateRef: number | string,
    regRef: number | string,
  ) => RegimentIconRef | null,
): {
  runtime: RegimentIconRuntime;
  apply: ReturnType<typeof vi.fn<RegimentIconRuntime["apply"]>>;
} {
  const apply = vi.fn<RegimentIconRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_regiment_icon tool", () => {
  it("sets icon by numeric ids", async () => {
    const { runtime, apply } = makeRuntime((stateRef, regRef) =>
      stateRef === 1 && regRef === 2
        ? {
            stateId: 1,
            stateName: "Altaria",
            i: 2,
            name: "2nd Regiment",
            previousIcon: "⚔",
          }
        : null,
    );
    const tool = createSetRegimentIconTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 2,
      icon: "🏹",
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 2, "🏹");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      stateId: 1,
      stateName: "Altaria",
      i: 2,
      name: "2nd Regiment",
      icon: "🏹",
      previousIcon: "⚔",
      noop: false,
    });
  });

  it("resolves by case-insensitive state + regiment names", async () => {
    const find = vi.fn<RegimentIconRuntime["find"]>((sRef, rRef) =>
      typeof sRef === "string" &&
      sRef.toLowerCase() === "altaria" &&
      typeof rRef === "string" &&
      rRef.toLowerCase() === "2nd regiment"
        ? {
            stateId: 1,
            stateName: "Altaria",
            i: 2,
            name: "2nd Regiment",
            previousIcon: "",
          }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetRegimentIconTool(runtime);
    await tool.execute({
      state: "ALTARIA",
      regiment: "2nd Regiment",
      icon: "⚔",
    });
    expect(apply).toHaveBeenCalledWith(1, 2, "⚔");
  });

  it("trims icon whitespace", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      stateId: 1,
      stateName: "x",
      i: 2,
      name: "y",
      previousIcon: "",
    }));
    const tool = createSetRegimentIconTool(runtime);
    await tool.execute({ state: 1, regiment: 2, icon: "  🏹  " });
    expect(apply).toHaveBeenCalledWith(1, 2, "🏹");
  });

  it("rejects empty / non-string icon", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      stateId: 1,
      stateName: "x",
      i: 2,
      name: "y",
      previousIcon: "",
    }));
    const tool = createSetRegimentIconTool(runtime);
    for (const bad of [null, undefined, 42, "", "   "]) {
      const r = await tool.execute({ state: 1, regiment: 2, icon: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid state refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRegimentIconTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: bad, regiment: 2, icon: "⚔" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid regiment refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRegimentIconTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: 1, regiment: bad, icon: "⚔" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown regiment", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRegimentIconTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 999,
      icon: "⚔",
    });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("is a noop when unchanged", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      stateId: 1,
      stateName: "x",
      i: 2,
      name: "y",
      previousIcon: "⚔",
    }));
    const tool = createSetRegimentIconTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 2,
      icon: "⚔",
    });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("surfaces runtime errors", async () => {
    const runtime: RegimentIconRuntime = {
      find: () => ({
        stateId: 1,
        stateName: "x",
        i: 2,
        name: "y",
        previousIcon: "",
      }),
      apply: vi.fn(() => {
        throw new Error("State 1 not found.");
      }),
    };
    const tool = createSetRegimentIconTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 2, icon: "⚔" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/State/);
  });
});

describe("defaultRegimentIconRuntime (integration)", () => {
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
            { i: 1, name: "1st Regiment", icon: "⚔" },
            { i: 2, name: "2nd Regiment", icon: "🏹" },
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

  it("writes icon on target regiment and calls drawMilitary once", async () => {
    const result = await setRegimentIconTool.execute({
      state: 1,
      regiment: 1,
      icon: "⛏",
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { states: { i: number; military?: RawRegiment[] }[] };
      }
    ).pack;
    const reg = pack.states[1]?.military?.find((r) => r.i === 1);
    expect(reg?.icon).toBe("⛏");
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("resolves by case-insensitive state name", async () => {
    await setRegimentIconTool.execute({
      state: "Altaria",
      regiment: 2,
      icon: "🛡",
    });
    const pack = (
      globalThis as {
        pack: { states: { i: number; military?: RawRegiment[] }[] };
      }
    ).pack;
    const reg = pack.states[1]?.military?.find((r) => r.i === 2);
    expect(reg?.icon).toBe("🛡");
  });

  it("succeeds when drawMilitary is missing", async () => {
    (globalThis as { drawMilitary?: unknown }).drawMilitary = undefined;
    const result = await setRegimentIconTool.execute({
      state: 1,
      regiment: 1,
      icon: "⛏",
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { states: { i: number; military?: RawRegiment[] }[] };
      }
    ).pack;
    const reg = pack.states[1]?.military?.find((r) => r.i === 1);
    expect(reg?.icon).toBe("⛏");
  });
});
