import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawReligion } from "./_shared";
import {
  createSetReligionTypeTool,
  type ReligionTypeRef,
  type ReligionTypeRuntime,
  resolveReligionType,
  setReligionTypeTool,
} from "./set-religion-type";

function makeRuntime(find: (ref: number | string) => ReligionTypeRef | null): {
  runtime: ReligionTypeRuntime;
  apply: ReturnType<typeof vi.fn<ReligionTypeRuntime["apply"]>>;
} {
  const apply = vi.fn<ReligionTypeRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("resolveReligionType", () => {
  it("resolves canonical values case-insensitively", () => {
    expect(resolveReligionType("Folk")).toBe("Folk");
    expect(resolveReligionType("organized")).toBe("Organized");
    expect(resolveReligionType("CULT")).toBe("Cult");
    expect(resolveReligionType("Heresy")).toBe("Heresy");
  });

  it("returns null for unknown", () => {
    expect(resolveReligionType("Faith")).toBeNull();
    expect(resolveReligionType(42)).toBeNull();
  });
});

describe("set_religion_type tool", () => {
  it("sets by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 2 ? { i: 2, name: "Brightpath", previousType: "Folk" } : null,
    );
    const tool = createSetReligionTypeTool(runtime);
    const result = await tool.execute({ religion: 2, type: "Organized" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(2, "Organized");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 2,
      name: "Brightpath",
      previousType: "Folk",
      type: "Organized",
    });
  });

  it("sets by case-insensitive name", async () => {
    const find = vi.fn<ReligionTypeRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "old faith"
        ? { i: 3, name: "Old Faith", previousType: "Folk" }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetReligionTypeTool(runtime);
    await tool.execute({ religion: "OLD FAITH", type: "Cult" });
    expect(find).toHaveBeenCalledWith("OLD FAITH");
    expect(apply).toHaveBeenCalledWith(3, "Cult");
  });

  it("canonicalizes lowercase type", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 2,
      name: "x",
      previousType: null,
    }));
    const tool = createSetReligionTypeTool(runtime);
    await tool.execute({ religion: 2, type: "heresy" });
    expect(apply).toHaveBeenCalledWith(2, "Heresy");
  });

  it("rejects unknown type", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 2,
      name: "x",
      previousType: null,
    }));
    const tool = createSetReligionTypeTool(runtime);
    const result = await tool.execute({ religion: 2, type: "Faith" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid religion refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetReligionTypeTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ religion: bad, type: "Cult" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses to retype religion 0 (No religion)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 0,
      name: "No religion",
      previousType: null,
    }));
    const tool = createSetReligionTypeTool(runtime);
    const result = await tool.execute({ religion: 0, type: "Folk" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when religion is unknown", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetReligionTypeTool(runtime);
    const result = await tool.execute({ religion: 999, type: "Cult" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: ReligionTypeRuntime = {
      find: () => ({ i: 1, name: "x", previousType: null }),
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetReligionTypeTool(runtime);
    const result = await tool.execute({ religion: 1, type: "Folk" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultReligionTypeRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      religions: [
        { i: 0, name: "No religion", removed: true },
        { i: 1, name: "Old Faith", type: "Folk" },
        { i: 2, name: "Brightpath", type: "Organized" },
      ] satisfies RawReligion[],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("retypes the religion in the live pack", async () => {
    const result = await setReligionTypeTool.execute({
      religion: 1,
      type: "Cult",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { religions: RawReligion[] } }).pack;
    expect(pack.religions[1]?.type).toBe("Cult");
  });

  it("refuses to retype a removed religion", async () => {
    const pack = (globalThis as { pack: { religions: RawReligion[] } }).pack;
    if (pack.religions[2]) pack.religions[2].removed = true;
    const result = await setReligionTypeTool.execute({
      religion: 2,
      type: "Cult",
    });
    expect(result.isError).toBe(true);
  });
});
