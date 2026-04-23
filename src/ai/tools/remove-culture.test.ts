import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg, RawCulture, RawState } from "./_shared";
import {
  createRemoveCultureTool,
  type RemoveCultureRef,
  type RemoveCultureResult,
  type RemoveCultureRuntime,
  removeCultureTool,
} from "./remove-culture";

function makeRuntime(
  find: (ref: number | string) => RemoveCultureRef | null,
  result: RemoveCultureResult = {
    cascadedOrigins: 0,
    reassignedBurgs: 0,
    reassignedStates: 0,
  },
): {
  runtime: RemoveCultureRuntime;
  remove: ReturnType<typeof vi.fn<RemoveCultureRuntime["remove"]>>;
} {
  const remove = vi.fn<RemoveCultureRuntime["remove"]>(() => result);
  return { runtime: { find, remove }, remove };
}

describe("remove_culture tool", () => {
  it("removes by numeric id", async () => {
    const { runtime, remove } = makeRuntime(
      (ref) => (ref === 1 ? { i: 1, name: "Highlanders" } : null),
      { cascadedOrigins: 2, reassignedBurgs: 3, reassignedStates: 1 },
    );
    const tool = createRemoveCultureTool(runtime);
    const result = await tool.execute({ culture: 1 });
    expect(result.isError).toBeFalsy();
    expect(remove).toHaveBeenCalledWith({ i: 1, name: "Highlanders" });
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      name: "Highlanders",
      cascadedOrigins: 2,
      reassignedBurgs: 3,
      reassignedStates: 1,
    });
  });

  it("resolves by case-insensitive name", async () => {
    const find = vi.fn<RemoveCultureRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "highlanders"
        ? { i: 1, name: "Highlanders" }
        : null,
    );
    const { runtime, remove } = makeRuntime(find);
    const tool = createRemoveCultureTool(runtime);
    await tool.execute({ culture: "HIGHLANDERS" });
    expect(find).toHaveBeenCalledWith("HIGHLANDERS");
    expect(remove).toHaveBeenCalled();
  });

  it("rejects invalid refs", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveCultureTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ culture: bad });
      expect(r.isError).toBe(true);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects culture 0 (Wildlands)", async () => {
    const { runtime, remove } = makeRuntime(() => ({
      i: 0,
      name: "Wildlands",
    }));
    const tool = createRemoveCultureTool(runtime);
    const result = await tool.execute({ culture: 0 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects unknown culture", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveCultureTool(runtime);
    const result = await tool.execute({ culture: 999 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: RemoveCultureRuntime = {
      find: () => ({ i: 1, name: "x" }),
      remove: vi.fn(() => {
        throw new Error("pack.cultures is not available.");
      }),
    };
    const tool = createRemoveCultureTool(runtime);
    const result = await tool.execute({ culture: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/cultures/);
  });
});

describe("defaultRemoveCultureRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;

  type FakeEl = {
    id: string;
    parent?: FakeEl;
    children: FakeEl[];
    appendChild(c: FakeEl): FakeEl;
    remove(): void;
  };
  function makeEl(id: string): FakeEl {
    return {
      id,
      children: [],
      appendChild(c) {
        c.parent = this;
        this.children.push(c);
        return c;
      },
      remove() {
        if (!this.parent) return;
        const idx = this.parent.children.indexOf(this);
        if (idx >= 0) this.parent.children.splice(idx, 1);
        this.parent = undefined;
      },
    };
  }

  let root: FakeEl;

  beforeEach(() => {
    root = makeEl("root");
    root.appendChild(makeEl("culture1"));
    root.appendChild(makeEl("cultureCenter1"));

    (globalThis as { pack?: unknown }).pack = {
      cells: { culture: [0, 1, 2, 1, 2, 0] },
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Highlanders", origins: [0] },
        { i: 2, name: "Coastalfolk", origins: [1, 0] },
        { i: 3, name: "Northmen", origins: [1] },
        { i: 4, name: "Gone", removed: true, origins: [1] },
      ] satisfies RawCulture[],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Altaria", culture: 1 },
        { i: 2, name: "Brighton", culture: 2 },
      ] satisfies RawState[],
      burgs: [
        { i: 0 },
        { i: 1, name: "Rookhold", culture: 1 },
        { i: 2, name: "Ashholm", culture: 1 },
        { i: 3, name: "Stormport", culture: 2 },
        { i: 4, name: "Gone", culture: 1, removed: true },
      ] satisfies RawBurg[],
    };
    (globalThis as { document?: unknown }).document = {
      getElementById(id: string) {
        const stack: FakeEl[] = [root];
        while (stack.length) {
          const n = stack.pop();
          if (n?.id === id) return n;
          if (n) stack.push(...n.children);
        }
        return null;
      },
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("cascades across burgs, states, cells, and origins", async () => {
    const result = await removeCultureTool.execute({ culture: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      i: 1,
      name: "Highlanders",
      reassignedBurgs: 2,
      reassignedStates: 1,
      cascadedOrigins: 2,
    });

    const pack = (
      globalThis as unknown as {
        pack: {
          cells: { culture: number[] };
          cultures: RawCulture[];
          states: RawState[];
          burgs: RawBurg[];
        };
      }
    ).pack;

    expect(pack.cells.culture).toEqual([0, 0, 2, 0, 2, 0]);
    expect(pack.cultures[1]?.removed).toBe(true);
    expect(pack.cultures[1]?.name).toBe("Highlanders");
    // Culture 2's origins was [1,0] → [0].
    expect(pack.cultures[2]?.origins).toEqual([0]);
    // Culture 3's origins was [1] → empty → reset to [0].
    expect(pack.cultures[3]?.origins).toEqual([0]);
    // Removed culture 4 untouched.
    expect(pack.cultures[4]?.origins).toEqual([1]);

    // Burgs 1,2 reassigned; burg 4 (removed) untouched.
    expect(pack.burgs[1]?.culture).toBe(0);
    expect(pack.burgs[2]?.culture).toBe(0);
    expect(pack.burgs[3]?.culture).toBe(2);
    expect(pack.burgs[4]?.culture).toBe(1);

    // State 1 reassigned; state 2 untouched.
    expect(pack.states[1]?.culture).toBe(0);
    expect(pack.states[2]?.culture).toBe(2);

    // DOM removals.
    expect(root.children.find((c) => c.id === "culture1")).toBeUndefined();
    expect(
      root.children.find((c) => c.id === "cultureCenter1"),
    ).toBeUndefined();
  });

  it("rejects culture 0", async () => {
    const result = await removeCultureTool.execute({ culture: 0 });
    expect(result.isError).toBe(true);
  });

  it("rejects an already-removed culture", async () => {
    const result = await removeCultureTool.execute({ culture: 4 });
    expect(result.isError).toBe(true);
  });

  it("resolves by case-insensitive name", async () => {
    await removeCultureTool.execute({ culture: "highlanders" });
    const pack = (globalThis as unknown as { pack: { cultures: RawCulture[] } })
      .pack;
    expect(pack.cultures[1]?.removed).toBe(true);
  });
});
