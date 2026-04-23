import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRegiment } from "./_shared";
import {
  createMoveRegimentTool,
  type MoveRegimentRef,
  type MoveRegimentRuntime,
  moveRegimentTool,
} from "./move-regiment";

function makeRuntime(
  find: (
    stateRef: number | string,
    regRef: number | string,
  ) => MoveRegimentRef | null,
): {
  runtime: MoveRegimentRuntime;
  move: ReturnType<typeof vi.fn<MoveRegimentRuntime["move"]>>;
} {
  const move = vi.fn<MoveRegimentRuntime["move"]>();
  return { runtime: { find, move }, move };
}

describe("move_regiment tool", () => {
  it("moves by numeric ids", async () => {
    const { runtime, move } = makeRuntime((sRef, rRef) =>
      sRef === 1 && rRef === 2
        ? {
            stateId: 1,
            stateName: "Altaria",
            i: 2,
            name: "2nd Regiment",
            previousX: 100,
            previousY: 200,
          }
        : null,
    );
    const tool = createMoveRegimentTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 2,
      x: 300,
      y: 400,
    });
    expect(result.isError).toBeFalsy();
    expect(move).toHaveBeenCalledWith(1, 2, 300, 400);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      stateId: 1,
      stateName: "Altaria",
      i: 2,
      name: "2nd Regiment",
      x: 300,
      y: 400,
      previousX: 100,
      previousY: 200,
      noop: false,
    });
  });

  it("resolves by case-insensitive state + regiment names", async () => {
    const find = vi.fn<MoveRegimentRuntime["find"]>((sRef, rRef) =>
      typeof sRef === "string" &&
      sRef.toLowerCase() === "altaria" &&
      typeof rRef === "string" &&
      rRef.toLowerCase() === "2nd regiment"
        ? {
            stateId: 1,
            stateName: "Altaria",
            i: 2,
            name: "2nd Regiment",
            previousX: 0,
            previousY: 0,
          }
        : null,
    );
    const { runtime, move } = makeRuntime(find);
    const tool = createMoveRegimentTool(runtime);
    await tool.execute({
      state: "ALTARIA",
      regiment: "2nd Regiment",
      x: 10,
      y: 20,
    });
    expect(move).toHaveBeenCalledWith(1, 2, 10, 20);
  });

  it("rejects non-finite x", async () => {
    const { runtime, move } = makeRuntime(() => ({
      stateId: 1,
      stateName: "x",
      i: 2,
      name: "y",
      previousX: 0,
      previousY: 0,
    }));
    const tool = createMoveRegimentTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, "100", null]) {
      const r = await tool.execute({ state: 1, regiment: 2, x: bad, y: 10 });
      expect(r.isError).toBe(true);
    }
    expect(move).not.toHaveBeenCalled();
  });

  it("rejects non-finite y", async () => {
    const { runtime, move } = makeRuntime(() => ({
      stateId: 1,
      stateName: "x",
      i: 2,
      name: "y",
      previousX: 0,
      previousY: 0,
    }));
    const tool = createMoveRegimentTool(runtime);
    for (const bad of [Number.NEGATIVE_INFINITY, Number.NaN, "", undefined]) {
      const r = await tool.execute({ state: 1, regiment: 2, x: 10, y: bad });
      expect(r.isError).toBe(true);
    }
    expect(move).not.toHaveBeenCalled();
  });

  it("rejects invalid state refs", async () => {
    const { runtime, move } = makeRuntime(() => null);
    const tool = createMoveRegimentTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: bad, regiment: 2, x: 10, y: 20 });
      expect(r.isError).toBe(true);
    }
    expect(move).not.toHaveBeenCalled();
  });

  it("rejects invalid regiment refs", async () => {
    const { runtime, move } = makeRuntime(() => null);
    const tool = createMoveRegimentTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: 1, regiment: bad, x: 10, y: 20 });
      expect(r.isError).toBe(true);
    }
    expect(move).not.toHaveBeenCalled();
  });

  it("rejects unknown regiment", async () => {
    const { runtime, move } = makeRuntime(() => null);
    const tool = createMoveRegimentTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 999,
      x: 10,
      y: 20,
    });
    expect(result.isError).toBe(true);
    expect(move).not.toHaveBeenCalled();
  });

  it("is a noop when coords unchanged", async () => {
    const { runtime, move } = makeRuntime(() => ({
      stateId: 1,
      stateName: "x",
      i: 2,
      name: "y",
      previousX: 100,
      previousY: 200,
    }));
    const tool = createMoveRegimentTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 2,
      x: 100,
      y: 200,
    });
    expect(move).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("surfaces runtime errors", async () => {
    const runtime: MoveRegimentRuntime = {
      find: () => ({
        stateId: 1,
        stateName: "x",
        i: 2,
        name: "y",
        previousX: 0,
        previousY: 0,
      }),
      move: vi.fn(() => {
        throw new Error("State 1 not found.");
      }),
    };
    const tool = createMoveRegimentTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 2,
      x: 100,
      y: 200,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/State/);
  });
});

describe("defaultMoveRegimentRuntime (integration)", () => {
  const moveRegiment = vi.fn((reg: RawRegiment, x: number, y: number) => {
    reg.x = x;
    reg.y = y;
  });
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalMove = (globalThis as { moveRegiment?: unknown }).moveRegiment;

  beforeEach(() => {
    moveRegiment.mockReset();
    moveRegiment.mockImplementation(
      (reg: RawRegiment, x: number, y: number) => {
        reg.x = x;
        reg.y = y;
      },
    );
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals" },
        {
          i: 1,
          name: "Altaria",
          military: [
            { i: 1, name: "1st Regiment", x: 100, y: 200 },
            { i: 2, name: "2nd Regiment", x: 300, y: 400 },
          ] satisfies RawRegiment[],
        },
      ],
    };
    (globalThis as { moveRegiment?: unknown }).moveRegiment = moveRegiment;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { moveRegiment?: unknown }).moveRegiment = originalMove;
  });

  it("delegates to window.moveRegiment with (reg, x, y)", async () => {
    const result = await moveRegimentTool.execute({
      state: 1,
      regiment: 1,
      x: 500,
      y: 600,
    });
    expect(result.isError).toBeFalsy();
    expect(moveRegiment).toHaveBeenCalledTimes(1);
    const call = moveRegiment.mock.calls[0];
    expect(call?.[0]).toMatchObject({ i: 1 });
    expect(call?.[1]).toBe(500);
    expect(call?.[2]).toBe(600);
    const pack = (
      globalThis as {
        pack: { states: { i: number; military?: RawRegiment[] }[] };
      }
    ).pack;
    const reg = pack.states[1]?.military?.find((r) => r.i === 1);
    expect(reg?.x).toBe(500);
    expect(reg?.y).toBe(600);
  });

  it("falls back to direct write when moveRegiment is missing", async () => {
    (globalThis as { moveRegiment?: unknown }).moveRegiment = undefined;
    const result = await moveRegimentTool.execute({
      state: 1,
      regiment: 2,
      x: 700,
      y: 800,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { states: { i: number; military?: RawRegiment[] }[] };
      }
    ).pack;
    const reg = pack.states[1]?.military?.find((r) => r.i === 2);
    expect(reg?.x).toBe(700);
    expect(reg?.y).toBe(800);
  });
});
