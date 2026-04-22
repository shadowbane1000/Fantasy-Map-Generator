import { describe, expect, it, vi } from "vitest";
import {
  createRenameStateTool,
  type StateMutationRuntime,
  type StateRef,
} from "./rename-state";

interface FakePackEntry {
  i: number;
  name: string;
  fullName?: string;
  removed?: boolean;
}

function makeRuntime(states: FakePackEntry[]) {
  const find = vi.fn((ref: number | string): StateRef | null => {
    if (typeof ref === "number") {
      const s = states[ref];
      if (!s || s.removed) return null;
      return { i: s.i, name: s.name, fullName: s.fullName ?? null };
    }
    const needle = ref.toLowerCase();
    for (const s of states) {
      if (!s || s.i === 0 || s.removed) continue;
      if (
        s.name.toLowerCase() === needle ||
        (s.fullName ?? "").toLowerCase() === needle
      )
        return { i: s.i, name: s.name, fullName: s.fullName ?? null };
    }
    return null;
  });
  const rename = vi.fn((i: number, name: string, fullName?: string): void => {
    const s = states[i];
    if (!s) throw new Error(`State ${i} not found.`);
    s.name = name;
    if (fullName !== undefined) s.fullName = fullName;
  });
  const runtime: StateMutationRuntime = { find, rename };
  return { runtime, find, rename, states };
}

function baseStates(): FakePackEntry[] {
  return [
    { i: 0, name: "Neutrals" },
    { i: 1, name: "Altaria", fullName: "The Kingdom of Altaria" },
    { i: 2, name: "Borgnia" },
    { i: 3, name: "Removed", removed: true },
  ];
}

describe("rename_state tool", () => {
  it("renames by numeric id", async () => {
    const { runtime, rename, states } = makeRuntime(baseStates());
    const tool = createRenameStateTool(runtime);
    const result = await tool.execute({ state: 2, name: "Zephyr" });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledWith(2, "Zephyr", undefined);
    expect(states[2].name).toBe("Zephyr");
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      i: 2,
      previousName: "Borgnia",
      name: "Zephyr",
    });
  });

  it("updates fullName when provided", async () => {
    const { runtime, rename, states } = makeRuntime(baseStates());
    const tool = createRenameStateTool(runtime);
    await tool.execute({
      state: 1,
      name: "Valorin",
      fullName: "The Kingdom of Valorin",
    });
    expect(rename).toHaveBeenCalledWith(1, "Valorin", "The Kingdom of Valorin");
    expect(states[1].fullName).toBe("The Kingdom of Valorin");
  });

  it("resolves case-insensitive string names", async () => {
    const { runtime, rename } = makeRuntime(baseStates());
    const tool = createRenameStateTool(runtime);
    await tool.execute({ state: "altaria", name: "Valorin" });
    expect(rename).toHaveBeenCalledWith(1, "Valorin", undefined);
  });

  it("returns an error for unknown id or name", async () => {
    const { runtime, rename } = makeRuntime(baseStates());
    const tool = createRenameStateTool(runtime);
    const a = await tool.execute({ state: 999, name: "X" });
    const b = await tool.execute({ state: "nowhere", name: "X" });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });

  it("refuses to rename the Neutrals placeholder", async () => {
    const { runtime, rename } = makeRuntime(baseStates());
    const tool = createRenameStateTool(runtime);
    const result = await tool.execute({ state: 0, name: "Anything" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/neutrals/i);
    expect(rename).not.toHaveBeenCalled();
  });

  it("trims input names and rejects empty/whitespace ones", async () => {
    const { runtime, rename } = makeRuntime(baseStates());
    const tool = createRenameStateTool(runtime);
    const empty = await tool.execute({ state: 1, name: "" });
    const ws = await tool.execute({ state: 1, name: "   " });
    const badFull = await tool.execute({
      state: 1,
      name: "Ok",
      fullName: "   ",
    });
    expect(empty.isError).toBe(true);
    expect(ws.isError).toBe(true);
    expect(badFull.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();

    await tool.execute({ state: 1, name: "  Zephyr  " });
    expect(rename).toHaveBeenCalledWith(1, "Zephyr", undefined);
  });

  it("surfaces runtime rename failures as error results", async () => {
    const { runtime } = makeRuntime(baseStates());
    runtime.rename = vi.fn(() => {
      throw new Error("cannot rename during customization");
    });
    const tool = createRenameStateTool(runtime);
    const result = await tool.execute({ state: 1, name: "Zephyr" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/customization/);
  });

  it("returns an error when the state ref isn't a valid type", async () => {
    const { runtime, rename } = makeRuntime(baseStates());
    const tool = createRenameStateTool(runtime);
    const a = await tool.execute({ state: null, name: "Zephyr" });
    const b = await tool.execute({ state: 1.5, name: "Zephyr" });
    const c = await tool.execute({ state: "", name: "Zephyr" });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(c.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });
});
