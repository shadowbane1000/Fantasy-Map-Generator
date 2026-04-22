import { describe, expect, it, vi } from "vitest";
import { fallbackAbbreviate } from "./rename-culture";
import {
  createRenameReligionTool,
  findReligionForRenameInPack,
  type ReligionMutationRuntime,
  type ReligionRef,
  type RenameReligionResult,
} from "./rename-religion";

interface FakeReligion {
  i: number;
  name: string;
  code?: string;
  removed?: boolean;
}

function makeRuntime(religions: FakeReligion[]) {
  const find = vi.fn((ref: number | string): ReligionRef | null => {
    if (typeof ref === "number") {
      const r = religions[ref];
      if (!r || r.removed) return null;
      return { i: r.i, name: r.name, code: r.code ?? null };
    }
    const needle = ref.toLowerCase();
    for (const r of religions) {
      if (!r || r.i === 0 || r.removed) continue;
      if (r.name.toLowerCase() === needle)
        return { i: r.i, name: r.name, code: r.code ?? null };
    }
    return null;
  });
  const rename = vi.fn((i: number, name: string): RenameReligionResult => {
    const r = religions[i];
    if (!r) throw new Error(`Religion ${i} not found.`);
    r.name = name;
    r.code = fallbackAbbreviate(
      name,
      religions
        .filter((x) => x && x.i !== i && !x.removed)
        .map((x) => x.code ?? ""),
    );
    return { code: r.code };
  });
  const runtime: ReligionMutationRuntime = { find, rename };
  return { runtime, find, rename, religions };
}

function baseReligions(): FakeReligion[] {
  return [
    { i: 0, name: "No religion", code: "No" },
    { i: 1, name: "Old Faith", code: "OF" },
    { i: 2, name: "Sun Cult", code: "SC" },
    { i: 3, name: "Gone", code: "Go", removed: true },
  ];
}

describe("rename_religion tool", () => {
  it("renames by numeric id and regenerates the code", async () => {
    const { runtime, rename, religions } = makeRuntime(baseReligions());
    const tool = createRenameReligionTool(runtime);
    const result = await tool.execute({
      religion: 1,
      name: "Wildshrine",
    });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledWith(1, "Wildshrine");
    expect(religions[1].name).toBe("Wildshrine");
    expect(religions[1].code).toBe("Wi");
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      i: 1,
      previousName: "Old Faith",
      previousCode: "OF",
      name: "Wildshrine",
      code: "Wi",
    });
  });

  it("resolves a case-insensitive name reference", async () => {
    const { runtime, rename } = makeRuntime(baseReligions());
    const tool = createRenameReligionTool(runtime);
    await tool.execute({ religion: "OLD FAITH", name: "Wildshrine" });
    expect(rename).toHaveBeenCalledWith(1, "Wildshrine");
  });

  it("refuses the index-0 placeholder", async () => {
    const { runtime, rename } = makeRuntime(baseReligions());
    const tool = createRenameReligionTool(runtime);
    const result = await tool.execute({ religion: 0, name: "Anything" });
    expect(result.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });

  it("errors on unknown id / name", async () => {
    const { runtime, rename } = makeRuntime(baseReligions());
    const tool = createRenameReligionTool(runtime);
    const a = await tool.execute({ religion: 99, name: "x" });
    const b = await tool.execute({ religion: "nowhere", name: "x" });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });

  it("trims names and rejects empty/whitespace", async () => {
    const { runtime, rename } = makeRuntime(baseReligions());
    const tool = createRenameReligionTool(runtime);
    for (const input of [
      { religion: 1, name: "" },
      { religion: 1, name: "   " },
    ]) {
      const r = await tool.execute(input);
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
    await tool.execute({ religion: 1, name: "  Wildshrine  " });
    expect(rename).toHaveBeenCalledWith(1, "Wildshrine");
  });

  it("surfaces runtime rename failures", async () => {
    const { runtime } = makeRuntime(baseReligions());
    runtime.rename = vi.fn(() => {
      throw new Error("lock engaged");
    });
    const tool = createRenameReligionTool(runtime);
    const result = await tool.execute({ religion: 1, name: "Wildshrine" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/lock/);
  });

  it("rejects invalid ref types", async () => {
    const { runtime, rename } = makeRuntime(baseReligions());
    const tool = createRenameReligionTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      const r = await tool.execute({ religion: bad, name: "x" });
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });
});

describe("findReligionForRenameInPack", () => {
  it("finds by id and name, skips placeholder/removed", () => {
    const pack = {
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "Old Faith", code: "OF" },
        { i: 2, name: "Gone", removed: true },
      ],
    };
    expect(findReligionForRenameInPack(pack, 1)).toEqual({
      i: 1,
      name: "Old Faith",
      code: "OF",
    });
    expect(findReligionForRenameInPack(pack, "old faith")).toEqual({
      i: 1,
      name: "Old Faith",
      code: "OF",
    });
    expect(findReligionForRenameInPack(pack, 2)).toBeNull();
    expect(findReligionForRenameInPack(pack, 0)).toBeNull();
    expect(findReligionForRenameInPack(pack, 99)).toBeNull();
    expect(findReligionForRenameInPack(pack, "")).toBeNull();
    expect(findReligionForRenameInPack(undefined, 1)).toBeNull();
  });
});
