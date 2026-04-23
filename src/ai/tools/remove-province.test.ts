import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawProvince, RawState } from "./_shared";
import {
  createRemoveProvinceTool,
  type RemoveProvinceRef,
  type RemoveProvinceRuntime,
  removeProvinceTool,
} from "./remove-province";

function makeRuntime(
  find: (ref: number | string) => RemoveProvinceRef | null,
): {
  runtime: RemoveProvinceRuntime;
  remove: ReturnType<typeof vi.fn<RemoveProvinceRuntime["remove"]>>;
} {
  const remove = vi.fn<RemoveProvinceRuntime["remove"]>();
  return { runtime: { find, remove }, remove };
}

describe("remove_province tool", () => {
  it("removes by numeric id", async () => {
    const { runtime, remove } = makeRuntime((ref) =>
      ref === 1
        ? { i: 1, name: "North", fullName: "North Mark", stateId: 1 }
        : null,
    );
    const tool = createRemoveProvinceTool(runtime);
    const result = await tool.execute({ province: 1 });
    expect(result.isError).toBeFalsy();
    expect(remove).toHaveBeenCalledWith({
      i: 1,
      name: "North",
      fullName: "North Mark",
      stateId: 1,
    });
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      name: "North",
      fullName: "North Mark",
      state: 1,
    });
  });

  it("resolves by case-insensitive name", async () => {
    const find = vi.fn<RemoveProvinceRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "north mark"
        ? { i: 1, name: "North", fullName: "North Mark", stateId: 1 }
        : null,
    );
    const { runtime, remove } = makeRuntime(find);
    const tool = createRemoveProvinceTool(runtime);
    await tool.execute({ province: "NORTH MARK" });
    expect(find).toHaveBeenCalledWith("NORTH MARK");
    expect(remove).toHaveBeenCalled();
  });

  it("rejects invalid refs", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveProvinceTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ province: bad });
      expect(r.isError).toBe(true);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects unknown province", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveProvinceTool(runtime);
    const result = await tool.execute({ province: 999 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: RemoveProvinceRuntime = {
      find: () => ({
        i: 1,
        name: "x",
        fullName: "x",
        stateId: 1,
      }),
      remove: vi.fn(() => {
        throw new Error("pack is not available.");
      }),
    };
    const tool = createRemoveProvinceTool(runtime);
    const result = await tool.execute({ province: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack/);
  });
});

describe("defaultRemoveProvinceRuntime (integration)", () => {
  const unfog = vi.fn();
  const drawBorders = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalUnfog = (globalThis as { unfog?: unknown }).unfog;
  const originalDraw = (globalThis as { drawBorders?: unknown }).drawBorders;

  type FakeEl = {
    id: string;
    attrs: Record<string, string>;
    children: FakeEl[];
    parent?: FakeEl;
    appendChild(child: FakeEl): FakeEl;
    remove(): void;
    querySelector(sel: string): FakeEl | null;
  };

  function makeEl(id: string, attrs: Record<string, string> = {}): FakeEl {
    const el: FakeEl = {
      id,
      attrs,
      children: [],
      appendChild(child) {
        child.parent = this;
        this.children.push(child);
        return child;
      },
      remove() {
        if (!this.parent) return;
        const idx = this.parent.children.indexOf(this);
        if (idx >= 0) this.parent.children.splice(idx, 1);
        this.parent = undefined;
      },
      querySelector(sel) {
        if (sel.startsWith("#")) {
          const wanted = sel.slice(1);
          const stack: FakeEl[] = [...this.children];
          while (stack.length) {
            const n = stack.pop();
            if (n?.id === wanted) return n;
            if (n) stack.push(...n.children);
          }
          return null;
        }
        // crude "tag[attr='val']" — we only need data-i match.
        const m = sel.match(/\[data-i='(\d+)'\]/);
        if (m) {
          const want = m[1];
          const stack: FakeEl[] = [...this.children];
          while (stack.length) {
            const n = stack.pop();
            if (n?.attrs["data-i"] === want) return n;
            if (n) stack.push(...n.children);
          }
        }
        return null;
      },
    };
    return el;
  }

  let root: FakeEl;

  beforeEach(() => {
    unfog.mockReset();
    drawBorders.mockReset();

    root = makeEl("root");
    const provinceCOA1 = makeEl("provinceCOA1");
    const provinceEmblems = makeEl("provinceEmblems");
    const emblemUse = makeEl("use", { "data-i": "1" });
    provinceEmblems.appendChild(emblemUse);
    const body = makeEl("provincesBody");
    const province1 = makeEl("province1");
    const provinceGap1 = makeEl("province-gap1");
    body.appendChild(province1);
    body.appendChild(provinceGap1);
    root.appendChild(provinceCOA1);
    root.appendChild(provinceEmblems);
    root.appendChild(body);

    (globalThis as { pack?: unknown }).pack = {
      cells: { province: [0, 1, 2, 1, 2, 0] },
      provinces: [
        { i: 0 },
        { i: 1, name: "North", fullName: "North Mark", state: 1 },
        { i: 2, name: "South", fullName: "South Mark", state: 1 },
        { i: 3, name: "Gone", fullName: "Gone", state: 1, removed: true },
      ] satisfies RawProvince[],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Altaria", provinces: [1, 2] },
      ] satisfies RawState[],
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
      querySelector(sel: string) {
        // Support a two-part "#<id> <rest>" selector by narrowing to the
        // #<id> subtree first, then applying the rest via FakeEl.querySelector.
        const space = sel.indexOf(" ");
        if (sel.startsWith("#") && space > 0) {
          const head = sel.slice(0, space);
          const tail = sel.slice(space + 1);
          const scope = root.querySelector(head);
          return scope ? scope.querySelector(tail) : null;
        }
        return root.querySelector(sel);
      },
    };

    (globalThis as { unfog?: unknown }).unfog = unfog;
    (globalThis as { drawBorders?: unknown }).drawBorders = drawBorders;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { unfog?: unknown }).unfog = originalUnfog;
    (globalThis as { drawBorders?: unknown }).drawBorders = originalDraw;
  });

  it("mutates cells / states / provinces and cleans DOM", async () => {
    const result = await removeProvinceTool.execute({ province: 1 });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as {
        pack: {
          cells: { province: number[] };
          provinces: RawProvince[];
          states: RawState[];
        };
      }
    ).pack;

    expect(pack.cells.province).toEqual([0, 0, 2, 0, 2, 0]);
    expect(pack.states[1]?.provinces).toEqual([2]);
    expect(pack.provinces[1]).toEqual({ i: 1, removed: true });

    expect(unfog).toHaveBeenCalledWith("focusProvince1");
    expect(drawBorders).toHaveBeenCalledTimes(1);

    // DOM removals
    expect(root.children.find((c) => c.id === "provinceCOA1")).toBeUndefined();
    const emblems = root.children.find((c) => c.id === "provinceEmblems");
    expect(
      emblems?.children.find((c) => c.attrs["data-i"] === "1"),
    ).toBeUndefined();
    const body = root.children.find((c) => c.id === "provincesBody");
    expect(body?.children.find((c) => c.id === "province1")).toBeUndefined();
    expect(
      body?.children.find((c) => c.id === "province-gap1"),
    ).toBeUndefined();
  });

  it("rejects an already-removed province", async () => {
    const result = await removeProvinceTool.execute({ province: 3 });
    expect(result.isError).toBe(true);
    expect(drawBorders).not.toHaveBeenCalled();
  });

  it("rejects id 0", async () => {
    const result = await removeProvinceTool.execute({ province: 0 });
    expect(result.isError).toBe(true);
  });

  it("resolves by case-insensitive fullName", async () => {
    await removeProvinceTool.execute({ province: "north mark" });
    const pack = (globalThis as { pack: { provinces: RawProvince[] } }).pack;
    expect(pack.provinces[1]).toEqual({ i: 1, removed: true });
  });
});
