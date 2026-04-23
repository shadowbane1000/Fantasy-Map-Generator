import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg } from "./_shared";
import {
  type BurgPortEnableResult,
  type BurgPortRef,
  type BurgPortRuntime,
  createSetBurgPortTool,
  setBurgPortTool,
} from "./set-burg-port";

function makeRuntime(find: (ref: number | string) => BurgPortRef | null): {
  runtime: BurgPortRuntime;
  enable: ReturnType<typeof vi.fn<BurgPortRuntime["enable"]>>;
  disable: ReturnType<typeof vi.fn<BurgPortRuntime["disable"]>>;
} {
  const enable = vi.fn<BurgPortRuntime["enable"]>(
    () => ({ port: 7, haven: true }) satisfies BurgPortEnableResult,
  );
  const disable = vi.fn<BurgPortRuntime["disable"]>();
  return { runtime: { find, enable, disable }, enable, disable };
}

describe("set_burg_port tool", () => {
  it("enables a port on a burg with a haven", async () => {
    const { runtime, enable, disable } = makeRuntime(() => ({
      i: 3,
      name: "Stormport",
      cell: 42,
      x: 100,
      y: 200,
      group: "cities",
      previousEnabled: false,
    }));
    const tool = createSetBurgPortTool(runtime);
    const result = await tool.execute({ burg: 3, enabled: true });
    expect(result.isError).toBeFalsy();
    expect(enable).toHaveBeenCalledTimes(1);
    expect(disable).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      i: 3,
      name: "Stormport",
      enabled: true,
      previousEnabled: false,
      port: 7,
      noop: false,
    });
    expect(body.warning).toBeUndefined();
  });

  it("enables a port on a burg with no haven and surfaces a warning", async () => {
    const runtime: BurgPortRuntime = {
      find: () => ({
        i: 3,
        name: "Inland",
        cell: 42,
        x: 100,
        y: 200,
        group: "cities",
        previousEnabled: false,
      }),
      enable: vi.fn(() => ({ port: -1, haven: false })),
      disable: vi.fn(),
    };
    const tool = createSetBurgPortTool(runtime);
    const result = await tool.execute({ burg: 3, enabled: true });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.port).toBe(-1);
    expect(body.warning).toMatch(/haven/);
  });

  it("disables an enabled port", async () => {
    const { runtime, enable, disable } = makeRuntime(() => ({
      i: 3,
      name: "Stormport",
      cell: 42,
      x: 100,
      y: 200,
      group: "cities",
      previousEnabled: true,
    }));
    const tool = createSetBurgPortTool(runtime);
    const result = await tool.execute({ burg: 3, enabled: false });
    expect(result.isError).toBeFalsy();
    expect(disable).toHaveBeenCalledTimes(1);
    expect(enable).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 3,
      name: "Stormport",
      enabled: false,
      previousEnabled: true,
      port: 0,
      noop: false,
    });
  });

  it("is a noop when already enabled", async () => {
    const { runtime, enable, disable } = makeRuntime(() => ({
      i: 1,
      name: "x",
      cell: 0,
      x: 0,
      y: 0,
      group: "cities",
      previousEnabled: true,
    }));
    const tool = createSetBurgPortTool(runtime);
    const result = await tool.execute({ burg: 1, enabled: true });
    expect(enable).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("is a noop when already disabled", async () => {
    const { runtime, enable, disable } = makeRuntime(() => ({
      i: 1,
      name: "x",
      cell: 0,
      x: 0,
      y: 0,
      group: "cities",
      previousEnabled: false,
    }));
    const tool = createSetBurgPortTool(runtime);
    const result = await tool.execute({ burg: 1, enabled: false });
    expect(enable).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("rejects invalid burg refs", async () => {
    const { runtime, enable, disable } = makeRuntime(() => null);
    const tool = createSetBurgPortTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ burg: bad, enabled: true });
      expect(r.isError).toBe(true);
    }
    expect(enable).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
  });

  it("rejects non-boolean enabled", async () => {
    const { runtime, enable, disable } = makeRuntime(() => ({
      i: 1,
      name: "x",
      cell: 0,
      x: 0,
      y: 0,
      group: "cities",
      previousEnabled: false,
    }));
    const tool = createSetBurgPortTool(runtime);
    for (const bad of ["yes", 1, 0, null, undefined]) {
      const r = await tool.execute({ burg: 1, enabled: bad });
      expect(r.isError).toBe(true);
    }
    expect(enable).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
  });

  it("rejects unknown burg", async () => {
    const { runtime, enable, disable } = makeRuntime(() => null);
    const tool = createSetBurgPortTool(runtime);
    const result = await tool.execute({ burg: 999, enabled: true });
    expect(result.isError).toBe(true);
    expect(enable).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
  });

  it("surfaces enable failure", async () => {
    const runtime: BurgPortRuntime = {
      find: () => ({
        i: 1,
        name: "x",
        cell: 0,
        x: 0,
        y: 0,
        group: "cities",
        previousEnabled: false,
      }),
      enable: vi.fn(() => {
        throw new Error("pack.cells missing");
      }),
      disable: vi.fn(),
    };
    const tool = createSetBurgPortTool(runtime);
    const result = await tool.execute({ burg: 1, enabled: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.cells/);
  });

  it("surfaces disable failure", async () => {
    const runtime: BurgPortRuntime = {
      find: () => ({
        i: 1,
        name: "x",
        cell: 0,
        x: 0,
        y: 0,
        group: "cities",
        previousEnabled: true,
      }),
      enable: vi.fn(() => ({ port: 0, haven: false })),
      disable: vi.fn(() => {
        throw new Error("Burg 1 not found.");
      }),
    };
    const tool = createSetBurgPortTool(runtime);
    const result = await tool.execute({ burg: 1, enabled: false });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not found/);
  });
});

describe("defaultBurgPortRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;

  type FakeEl = {
    id: string;
    children: FakeEl[];
    attributes: Record<string, string>;
    parent?: FakeEl;
    setAttribute(k: string, v: string): void;
    appendChild(child: FakeEl): FakeEl;
    remove(): void;
    querySelector(sel: string): FakeEl | null;
  };

  function makeEl(id: string): FakeEl {
    const el: FakeEl = {
      id,
      children: [],
      attributes: {},
      setAttribute(k, v) {
        this.attributes[k] = v;
        if (k === "id") this.id = v;
      },
      appendChild(child) {
        child.parent = this;
        this.children.push(child);
        return child;
      },
      remove() {
        if (!this.parent) return;
        const i = this.parent.children.indexOf(this);
        if (i >= 0) this.parent.children.splice(i, 1);
        this.parent = undefined;
      },
      querySelector(sel) {
        if (sel.startsWith("#")) {
          const wantedId = sel.slice(1);
          const stack: FakeEl[] = [...this.children];
          while (stack.length) {
            const n = stack.pop();
            if (n?.id === wantedId) return n;
            if (n) stack.push(...n.children);
          }
          return null;
        }
        // crude attribute selector: "#anchors [data-id='<i>']"
        const match = sel.match(/\[data-id='(\d+)'\]/);
        if (match) {
          const id = match[1];
          const stack: FakeEl[] = [...this.children];
          while (stack.length) {
            const n = stack.pop();
            if (n?.attributes["data-id"] === id) return n;
            if (n) stack.push(...n.children);
          }
        }
        return null;
      },
    };
    return el;
  }

  let anchorsEl: FakeEl;
  let citiesGroup: FakeEl;

  beforeEach(() => {
    anchorsEl = makeEl("anchors");
    citiesGroup = makeEl("cities");
    anchorsEl.appendChild(citiesGroup);

    (globalThis as { pack?: unknown }).pack = {
      burgs: [
        { i: 0 },
        {
          i: 1,
          name: "Stormport",
          cell: 10,
          x: 100,
          y: 200,
          group: "cities",
        },
        { i: 2, name: "Inland", cell: 20, x: 50, y: 60, group: "cities" },
        {
          i: 3,
          name: "Anchored",
          cell: 30,
          x: 10,
          y: 20,
          group: "cities",
          port: 5,
        },
      ] satisfies RawBurg[],
      cells: {
        haven: { 10: 99, 20: 0, 30: 77 } as unknown as ArrayLike<number>,
        f: { 99: 7, 77: 3 } as unknown as ArrayLike<number>,
      },
    };

    (globalThis as { document?: unknown }).document = {
      getElementById(id: string) {
        if (id === "anchors") return anchorsEl;
        return null;
      },
      querySelector(sel: string) {
        if (sel.startsWith("#anchors ")) {
          return anchorsEl.querySelector(sel.slice("#anchors ".length));
        }
        return null;
      },
      createElementNS(_ns: string, _tag: string) {
        return makeEl("");
      },
    };

    // Append a pre-existing anchor for the already-enabled burg 3
    const existingAnchor = makeEl("anchor3");
    existingAnchor.setAttribute("data-id", "3");
    citiesGroup.appendChild(existingAnchor);
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("enables a port with a haven and appends the anchor element", async () => {
    const result = await setBurgPortTool.execute({ burg: 1, enabled: true });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.port).toBe(7);
    expect(body.warning).toBeUndefined();
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[1]?.port).toBe(7);
    const added = citiesGroup.children.find((c) => c.id === "anchor1");
    expect(added).toBeTruthy();
    expect(added?.attributes["data-id"]).toBe("1");
    expect(added?.attributes.href).toBe("#icon-anchor");
    expect(added?.attributes.x).toBe("100");
    expect(added?.attributes.y).toBe("200");
  });

  it("enables a port with no haven and surfaces a warning", async () => {
    const result = await setBurgPortTool.execute({ burg: 2, enabled: true });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.port).toBe(-1);
    expect(body.warning).toMatch(/haven/);
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[2]?.port).toBe(-1);
  });

  it("disables an enabled port and removes the anchor element", async () => {
    const result = await setBurgPortTool.execute({ burg: 3, enabled: false });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[3]?.port).toBe(0);
    const remaining = citiesGroup.children.find((c) => c.id === "anchor3");
    expect(remaining).toBeUndefined();
  });
});
