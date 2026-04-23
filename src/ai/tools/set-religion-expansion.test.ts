import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawReligion } from "./_shared";
import {
  createSetReligionExpansionTool,
  type ReligionExpansionRef,
  type ReligionExpansionRuntime,
  resolveReligionExpansion,
  setReligionExpansionTool,
} from "./set-religion-expansion";

function makeRuntime(
  find: (ref: number | string) => ReligionExpansionRef | null,
): {
  runtime: ReligionExpansionRuntime;
  apply: ReturnType<typeof vi.fn<ReligionExpansionRuntime["apply"]>>;
} {
  const apply = vi.fn<ReligionExpansionRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("resolveReligionExpansion", () => {
  it("canonicalizes case-insensitively", () => {
    expect(resolveReligionExpansion("Global")).toBe("global");
    expect(resolveReligionExpansion("STATE")).toBe("state");
    expect(resolveReligionExpansion("culture")).toBe("culture");
  });

  it("returns null for unknown or non-string", () => {
    expect(resolveReligionExpansion("universal")).toBeNull();
    expect(resolveReligionExpansion("")).toBeNull();
    expect(resolveReligionExpansion(42)).toBeNull();
    expect(resolveReligionExpansion(null)).toBeNull();
  });
});

describe("set_religion_expansion tool", () => {
  it("sets by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 2
        ? { i: 2, name: "Lunarism", previousExpansion: "global" }
        : null,
    );
    const tool = createSetReligionExpansionTool(runtime);
    const result = await tool.execute({ religion: 2, expansion: "state" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(2, "state");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 2,
      name: "Lunarism",
      previousExpansion: "global",
      expansion: "state",
      noop: false,
    });
  });

  it("resolves by case-insensitive name and canonicalizes case", async () => {
    const find = vi.fn<ReligionExpansionRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "lunarism"
        ? { i: 2, name: "Lunarism", previousExpansion: "global" }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetReligionExpansionTool(runtime);
    await tool.execute({ religion: "LUNARISM", expansion: "CULTURE" });
    expect(find).toHaveBeenCalledWith("LUNARISM");
    expect(apply).toHaveBeenCalledWith(2, "culture");
  });

  it("rejects unknown expansion", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousExpansion: null,
    }));
    const tool = createSetReligionExpansionTool(runtime);
    const result = await tool.execute({ religion: 1, expansion: "universal" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.supported).toEqual(["global", "state", "culture"]);
  });

  it("rejects empty / non-string expansion", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousExpansion: null,
    }));
    const tool = createSetReligionExpansionTool(runtime);
    for (const bad of [null, undefined, 42, "", "   "]) {
      const r = await tool.execute({ religion: 1, expansion: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown religion", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetReligionExpansionTool(runtime);
    const result = await tool.execute({ religion: 999, expansion: "state" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid religion refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetReligionExpansionTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ religion: bad, expansion: "state" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects religion id 0 (placeholder)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 0,
      name: "No religion",
      previousExpansion: null,
    }));
    const tool = createSetReligionExpansionTool(runtime);
    const result = await tool.execute({ religion: 0, expansion: "state" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("is a noop when already at the target extent", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousExpansion: "state",
    }));
    const tool = createSetReligionExpansionTool(runtime);
    const result = await tool.execute({ religion: 1, expansion: "state" });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("surfaces runtime errors", async () => {
    const runtime: ReligionExpansionRuntime = {
      find: () => ({ i: 1, name: "x", previousExpansion: "global" }),
      apply: vi.fn(() => {
        throw new Error("Religion 1 has been removed.");
      }),
    };
    const tool = createSetReligionExpansionTool(runtime);
    const result = await tool.execute({ religion: 1, expansion: "state" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/removed/);
  });
});

describe("defaultReligionExpansionRuntime (integration)", () => {
  const recalc = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRecalc = (globalThis as { recalculateReligions?: unknown })
    .recalculateReligions;

  beforeEach(() => {
    recalc.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "Solarism", expansion: "global" },
        { i: 2, name: "Lunarism", expansion: "global" },
        { i: 3, name: "Gone", expansion: "global", removed: true },
      ] satisfies RawReligion[],
    };
    (globalThis as { recalculateReligions?: unknown }).recalculateReligions =
      recalc;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { recalculateReligions?: unknown }).recalculateReligions =
      originalRecalc;
  });

  it("writes the expansion and calls recalculateReligions once", async () => {
    const result = await setReligionExpansionTool.execute({
      religion: 2,
      expansion: "state",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { religions: RawReligion[] } }).pack;
    expect(pack.religions[2]?.expansion).toBe("state");
    expect(recalc).toHaveBeenCalledTimes(1);
  });

  it("rejects religion 0", async () => {
    const result = await setReligionExpansionTool.execute({
      religion: 0,
      expansion: "state",
    });
    expect(result.isError).toBe(true);
    expect(recalc).not.toHaveBeenCalled();
  });

  it("rejects a removed religion", async () => {
    const result = await setReligionExpansionTool.execute({
      religion: 3,
      expansion: "state",
    });
    expect(result.isError).toBe(true);
    expect(recalc).not.toHaveBeenCalled();
  });

  it("succeeds when recalculateReligions is missing", async () => {
    (globalThis as { recalculateReligions?: unknown }).recalculateReligions =
      undefined;
    const result = await setReligionExpansionTool.execute({
      religion: 1,
      expansion: "culture",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { religions: RawReligion[] } }).pack;
    expect(pack.religions[1]?.expansion).toBe("culture");
  });
});
