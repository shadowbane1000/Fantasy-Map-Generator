import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRegiment, RawState } from "./_shared";
import {
  createRenameRegimentTool,
  findRegimentByRef,
  type RegimentRenameRef,
  type RegimentRenameRuntime,
  renameRegimentTool,
} from "./rename-regiment";

function makeRuntime(
  find: (
    stateRef: number | string,
    regRef: number | string,
  ) => RegimentRenameRef | null,
): {
  runtime: RegimentRenameRuntime;
  rename: ReturnType<typeof vi.fn<RegimentRenameRuntime["rename"]>>;
} {
  const rename = vi.fn<RegimentRenameRuntime["rename"]>();
  return { runtime: { find, rename }, rename };
}

describe("rename_regiment tool", () => {
  it("renames by (state id, regiment id)", async () => {
    const { runtime, rename } = makeRuntime((sref, rref) =>
      sref === 1 && rref === 0
        ? { stateId: 1, stateName: "Rookhold", i: 0, name: "1st Army" }
        : null,
    );
    const tool = createRenameRegimentTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 0,
      name: "Ashguard Legion",
    });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledWith(1, 0, "Ashguard Legion");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      stateId: 1,
      stateName: "Rookhold",
      i: 0,
      previousName: "1st Army",
      name: "Ashguard Legion",
    });
  });

  it("renames by (state name, regiment name)", async () => {
    const find = vi.fn<RegimentRenameRuntime["find"]>((sref, rref) =>
      typeof sref === "string" &&
      sref.toLowerCase() === "rookhold" &&
      typeof rref === "string" &&
      rref.toLowerCase() === "1st army"
        ? { stateId: 1, stateName: "Rookhold", i: 0, name: "1st Army" }
        : null,
    );
    const { runtime, rename } = makeRuntime(find);
    const tool = createRenameRegimentTool(runtime);
    await tool.execute({
      state: "ROOKHOLD",
      regiment: "1st army",
      name: "New Name",
    });
    expect(find).toHaveBeenCalledWith("ROOKHOLD", "1st army");
    expect(rename).toHaveBeenCalledWith(1, 0, "New Name");
  });

  it("trims the new name", async () => {
    const { runtime, rename } = makeRuntime(() => ({
      stateId: 1,
      stateName: "x",
      i: 0,
      name: "old",
    }));
    const tool = createRenameRegimentTool(runtime);
    await tool.execute({ state: 1, regiment: 0, name: "  New  " });
    expect(rename).toHaveBeenCalledWith(1, 0, "New");
  });

  it("errors when the state/regiment pair is unknown", async () => {
    const { runtime, rename } = makeRuntime(() => null);
    const tool = createRenameRegimentTool(runtime);
    const result = await tool.execute({
      state: 999,
      regiment: 0,
      name: "new",
    });
    expect(result.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects invalid state refs", async () => {
    const { runtime, rename } = makeRuntime(() => null);
    const tool = createRenameRegimentTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: bad, regiment: 0, name: "new" });
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects invalid regiment refs", async () => {
    const { runtime, rename } = makeRuntime(() => null);
    const tool = createRenameRegimentTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: 1, regiment: bad, name: "new" });
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects invalid names", async () => {
    const { runtime, rename } = makeRuntime(() => ({
      stateId: 1,
      stateName: "x",
      i: 0,
      name: "old",
    }));
    const tool = createRenameRegimentTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      const r = await tool.execute({ state: 1, regiment: 0, name: bad });
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });

  it("allows renaming to the same name", async () => {
    const { runtime, rename } = makeRuntime(() => ({
      stateId: 1,
      stateName: "x",
      i: 0,
      name: "same",
    }));
    const tool = createRenameRegimentTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 0,
      name: "same",
    });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledWith(1, 0, "same");
  });

  it("surfaces runtime failures", async () => {
    const runtime: RegimentRenameRuntime = {
      find: () => ({ stateId: 1, stateName: "x", i: 0, name: "old" }),
      rename: vi.fn(() => {
        throw new Error("missing pack");
      }),
    };
    const tool = createRenameRegimentTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 0,
      name: "new",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/missing pack/);
  });
});

describe("findRegimentByRef", () => {
  const military: RawRegiment[] = [
    { i: 0, name: "1st Army" },
    { i: 2, name: "2nd Army" },
    { i: 5, name: "The Red Phalanx" },
  ];

  it("returns null when military is not an array", () => {
    expect(findRegimentByRef(undefined, 0)).toBeNull();
  });

  it("matches by numeric i", () => {
    expect(findRegimentByRef(military, 2)).toBe(military[1]);
    expect(findRegimentByRef(military, 5)).toBe(military[2]);
    expect(findRegimentByRef(military, 3)).toBeNull();
  });

  it("matches case-insensitive name and trims whitespace", () => {
    expect(findRegimentByRef(military, "1st army")).toBe(military[0]);
    expect(findRegimentByRef(military, "  THE RED PHALANX  ")).toBe(
      military[2],
    );
  });

  it("rejects invalid refs", () => {
    expect(findRegimentByRef(military, 1.5)).toBeNull();
    expect(findRegimentByRef(military, "")).toBeNull();
    expect(findRegimentByRef(military, "   ")).toBeNull();
  });
});

describe("defaultRegimentRenameRuntime (integration)", () => {
  const setAttribute = vi.fn();
  const getElementById = vi.fn((id: string) =>
    id === "regiment1-2" ? { setAttribute } : null,
  );
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;

  beforeEach(() => {
    setAttribute.mockReset();
    getElementById.mockClear();
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals", removed: true },
        {
          i: 1,
          name: "Rookhold",
          military: [
            { i: 0, name: "1st Army" },
            { i: 2, name: "The Red Phalanx" },
          ],
        },
      ] satisfies RawState[],
    };
    (globalThis as { document?: unknown }).document = { getElementById };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("renames regiment in the live pack and updates the SVG data-name", async () => {
    const result = await renameRegimentTool.execute({
      state: 1,
      regiment: 2,
      name: "Ashguard Legion",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[1]?.military?.[1]?.name).toBe("Ashguard Legion");
    expect(setAttribute).toHaveBeenCalledWith("data-name", "Ashguard Legion");
  });

  it("still renames when the SVG element is not mounted", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    const result = await renameRegimentTool.execute({
      state: "Rookhold",
      regiment: "1st Army",
      name: "New Name",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[1]?.military?.[0]?.name).toBe("New Name");
  });

  it("errors when the regiment does not exist", async () => {
    const result = await renameRegimentTool.execute({
      state: 1,
      regiment: 999,
      name: "new",
    });
    expect(result.isError).toBe(true);
  });

  it("errors when the state is removed/missing", async () => {
    const result = await renameRegimentTool.execute({
      state: 0,
      regiment: 0,
      name: "new",
    });
    expect(result.isError).toBe(true);
  });
});
