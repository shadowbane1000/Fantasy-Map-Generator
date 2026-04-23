import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawReligion } from "./_shared";
import {
  createRemoveReligionTool,
  type RemoveReligionRef,
  type RemoveReligionResult,
  type RemoveReligionRuntime,
  removeReligionTool,
} from "./remove-religion";

function makeRuntime(
  find: (ref: number | string) => RemoveReligionRef | null,
  result: RemoveReligionResult = { cascadedOrigins: 0 },
): {
  runtime: RemoveReligionRuntime;
  remove: ReturnType<typeof vi.fn<RemoveReligionRuntime["remove"]>>;
} {
  const remove = vi.fn<RemoveReligionRuntime["remove"]>(() => result);
  return { runtime: { find, remove }, remove };
}

describe("remove_religion tool", () => {
  it("removes by numeric id", async () => {
    const { runtime, remove } = makeRuntime(
      (ref) => (ref === 2 ? { i: 2, name: "Lunarism" } : null),
      { cascadedOrigins: 1 },
    );
    const tool = createRemoveReligionTool(runtime);
    const result = await tool.execute({ religion: 2 });
    expect(result.isError).toBeFalsy();
    expect(remove).toHaveBeenCalledWith({ i: 2, name: "Lunarism" });
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 2,
      name: "Lunarism",
      cascadedOrigins: 1,
    });
  });

  it("resolves by case-insensitive name", async () => {
    const find = vi.fn<RemoveReligionRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "lunarism"
        ? { i: 2, name: "Lunarism" }
        : null,
    );
    const { runtime, remove } = makeRuntime(find);
    const tool = createRemoveReligionTool(runtime);
    await tool.execute({ religion: "LUNARISM" });
    expect(find).toHaveBeenCalledWith("LUNARISM");
    expect(remove).toHaveBeenCalled();
  });

  it("rejects invalid refs", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveReligionTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ religion: bad });
      expect(r.isError).toBe(true);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects religion id 0", async () => {
    const { runtime, remove } = makeRuntime(() => ({
      i: 0,
      name: "No religion",
    }));
    const tool = createRemoveReligionTool(runtime);
    const result = await tool.execute({ religion: 0 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects unknown religion", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveReligionTool(runtime);
    const result = await tool.execute({ religion: 999 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: RemoveReligionRuntime = {
      find: () => ({ i: 2, name: "Lunarism" }),
      remove: vi.fn(() => {
        throw new Error("pack.religions is not available.");
      }),
    };
    const tool = createRemoveReligionTool(runtime);
    const result = await tool.execute({ religion: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/religions/);
  });
});

describe("defaultRemoveReligionRuntime (integration)", () => {
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
    const r2 = makeEl("religion2");
    const g2 = makeEl("religion-gap2");
    const c2 = makeEl("religionsCenter2");
    root.appendChild(r2);
    root.appendChild(g2);
    root.appendChild(c2);

    (globalThis as { pack?: unknown }).pack = {
      cells: { religion: [0, 1, 2, 1, 2, 0] },
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "Solarism", origins: [0] },
        { i: 2, name: "Lunarism", origins: [1, 0] },
        { i: 3, name: "Astralism", origins: [2] },
        { i: 4, name: "Gone", removed: true, origins: [1] },
      ] satisfies RawReligion[],
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

  it("zeroes cells, tombstones, cascades origins", async () => {
    const result = await removeReligionTool.execute({ religion: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.cascadedOrigins).toBe(1);

    const pack = (
      globalThis as unknown as {
        pack: {
          cells: { religion: number[] };
          religions: RawReligion[];
        };
      }
    ).pack;

    expect(pack.cells.religion).toEqual([0, 1, 0, 1, 0, 0]);
    expect(pack.religions[2]?.removed).toBe(true);
    // Name preserved (tombstone leaves rest of the object alone).
    expect(pack.religions[2]?.name).toBe("Lunarism");
    // Religion 3's origins was [2]; 2 filtered out → [] → reset to [0].
    expect(pack.religions[3]?.origins).toEqual([0]);
    // Religion 1 untouched (its origins [0] didn't include 2).
    expect(pack.religions[1]?.origins).toEqual([0]);
    // Removed religion 4 not cascaded into.
    expect(pack.religions[4]?.origins).toEqual([1]);

    // DOM removals.
    expect(root.children.find((c) => c.id === "religion2")).toBeUndefined();
    expect(root.children.find((c) => c.id === "religion-gap2")).toBeUndefined();
    expect(
      root.children.find((c) => c.id === "religionsCenter2"),
    ).toBeUndefined();
  });

  it("rejects religion 0", async () => {
    const result = await removeReligionTool.execute({ religion: 0 });
    expect(result.isError).toBe(true);
  });

  it("rejects an already-removed religion", async () => {
    const result = await removeReligionTool.execute({ religion: 4 });
    expect(result.isError).toBe(true);
  });

  it("resolves by case-insensitive name", async () => {
    await removeReligionTool.execute({ religion: "lunarism" });
    const pack = (
      globalThis as unknown as { pack: { religions: RawReligion[] } }
    ).pack;
    expect(pack.religions[2]?.removed).toBe(true);
  });
});
