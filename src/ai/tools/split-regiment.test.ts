import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRegiment, RawState } from "./_shared";
import {
  createSplitRegimentTool,
  type SplitRegimentRef,
  type SplitRegimentResult,
  type SplitRegimentRuntime,
  splitRegimentTool,
} from "./split-regiment";

function makeRuntime(
  find: (
    stateRef: number | string,
    regRef: number | string,
  ) => SplitRegimentRef | null,
  result: SplitRegimentResult = {
    newRegimentId: 3,
    newName: "New Regiment",
    oldTotal: 50,
    newTotal: 50,
  },
): {
  runtime: SplitRegimentRuntime;
  split: ReturnType<typeof vi.fn<SplitRegimentRuntime["split"]>>;
} {
  const split = vi.fn<SplitRegimentRuntime["split"]>(() => result);
  return { runtime: { find, split }, split };
}

describe("split_regiment tool", () => {
  it("happy path delegates and returns counts", async () => {
    const { runtime, split } = makeRuntime(
      () => ({
        stateId: 1,
        stateName: "Altaria",
        i: 2,
        name: "2nd Regiment",
        units: { Swordsmen: 100, Archers: 50 },
      }),
      {
        newRegimentId: 3,
        newName: "3rd Regiment",
        oldTotal: 75,
        newTotal: 75,
      },
    );
    const tool = createSplitRegimentTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 2 });
    expect(result.isError).toBeFalsy();
    expect(split).toHaveBeenCalled();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      stateId: 1,
      stateName: "Altaria",
      i: 2,
      name: "2nd Regiment",
      newRegimentId: 3,
      newName: "3rd Regiment",
      oldTotal: 75,
      newTotal: 75,
    });
  });

  it("resolves by case-insensitive names", async () => {
    const find = vi.fn<SplitRegimentRuntime["find"]>((sRef, rRef) =>
      typeof sRef === "string" &&
      sRef.toLowerCase() === "altaria" &&
      typeof rRef === "string" &&
      rRef.toLowerCase() === "2nd regiment"
        ? {
            stateId: 1,
            stateName: "Altaria",
            i: 2,
            name: "2nd Regiment",
            units: { Archers: 10 },
          }
        : null,
    );
    const { runtime, split } = makeRuntime(find);
    const tool = createSplitRegimentTool(runtime);
    await tool.execute({ state: "ALTARIA", regiment: "2nd Regiment" });
    expect(split).toHaveBeenCalled();
  });

  it("rejects invalid state refs", async () => {
    const { runtime, split } = makeRuntime(() => null);
    const tool = createSplitRegimentTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: bad, regiment: 2 });
      expect(r.isError).toBe(true);
    }
    expect(split).not.toHaveBeenCalled();
  });

  it("rejects invalid regiment refs", async () => {
    const { runtime, split } = makeRuntime(() => null);
    const tool = createSplitRegimentTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: 1, regiment: bad });
      expect(r.isError).toBe(true);
    }
    expect(split).not.toHaveBeenCalled();
  });

  it("rejects unknown regiment", async () => {
    const { runtime, split } = makeRuntime(() => null);
    const tool = createSplitRegimentTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 999 });
    expect(result.isError).toBe(true);
    expect(split).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors (not enough forces)", async () => {
    const runtime: SplitRegimentRuntime = {
      find: () => ({
        stateId: 1,
        stateName: "x",
        i: 2,
        name: "y",
        units: { Swordsmen: 1 },
      }),
      split: vi.fn(() => {
        throw new Error("Not enough forces to split.");
      }),
    };
    const tool = createSplitRegimentTool(runtime);
    const result = await tool.execute({ state: 1, regiment: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/forces/);
  });
});

describe("defaultSplitRegimentRuntime (integration)", () => {
  const getName = vi.fn(
    (_reg: RawRegiment, _military: RawRegiment[]) => "Auto Name",
  );
  const generateNote = vi.fn();
  const drawRegiment = vi.fn();

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalMilitary = (globalThis as { Military?: unknown }).Military;
  const originalDraw = (globalThis as { drawRegiment?: unknown }).drawRegiment;
  const originalArmies = (globalThis as { armies?: unknown }).armies;

  beforeEach(() => {
    getName.mockReset();
    getName.mockReturnValue("Auto Name");
    generateNote.mockReset();
    drawRegiment.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals" },
        {
          i: 1,
          name: "Altaria",
          military: [
            {
              i: 1,
              name: "1st",
              x: 100,
              y: 200,
              cell: 10,
              n: 0,
              u: { Swords: 100, Archers: 50 },
              a: 150,
              state: 1,
              icon: "⚔",
            },
          ] satisfies RawRegiment[],
        },
      ] satisfies RawState[],
    };
    (globalThis as { Military?: unknown }).Military = {
      getName,
      generateNote,
    };
    (globalThis as { drawRegiment?: unknown }).drawRegiment = drawRegiment;
    (globalThis as { armies?: unknown }).armies = {
      attr: (key: string) => (key === "box-size" ? "15" : ""),
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Military?: unknown }).Military = originalMilitary;
    (globalThis as { drawRegiment?: unknown }).drawRegiment = originalDraw;
    (globalThis as { armies?: unknown }).armies = originalArmies;
  });

  it("splits a regiment 50/50", async () => {
    const result = await splitRegimentTool.execute({
      state: 1,
      regiment: 1,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { states: { i: number; military?: RawRegiment[] }[] };
      }
    ).pack;
    const military = pack.states[1]?.military ?? [];
    expect(military.length).toBe(2);
    const source = military.find((r) => r.i === 1);
    const clone = military.find((r) => r.i === 2);
    // ceil(100/2)=50, ceil(50/2)=25
    expect(source?.u).toEqual({ Swords: 50, Archers: 25 });
    expect(source?.a).toBe(75);
    // floor(100/2)=50, floor(50/2)=25
    expect(clone?.u).toEqual({ Swords: 50, Archers: 25 });
    expect(clone?.a).toBe(75);
    expect(clone?.name).toBe("Auto Name");
    expect(generateNote).toHaveBeenCalled();
    expect(drawRegiment).toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.newRegimentId).toBe(2);
    expect(body.oldTotal).toBe(75);
    expect(body.newTotal).toBe(75);
  });

  it("rejects a regiment with single-unit total 1 (floor=0)", async () => {
    const pack = (
      globalThis as {
        pack: { states: { i: number; military?: RawRegiment[] }[] };
      }
    ).pack;
    const reg = pack.states[1]?.military?.[0];
    if (reg) reg.u = { Swords: 1 };
    const result = await splitRegimentTool.execute({
      state: 1,
      regiment: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/forces/);
  });

  it("errors when Military.getName is missing", async () => {
    (globalThis as { Military?: unknown }).Military = {};
    const result = await splitRegimentTool.execute({
      state: 1,
      regiment: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Military\.getName/);
  });
});
