import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawReligion } from "./_shared";
import {
  createSetReligionDeityTool,
  type ReligionDeityRef,
  type ReligionDeityRuntime,
  setReligionDeityTool,
} from "./set-religion-deity";

function makeRuntime(find: (ref: number | string) => ReligionDeityRef | null): {
  runtime: ReligionDeityRuntime;
  apply: ReturnType<typeof vi.fn<ReligionDeityRuntime["apply"]>>;
} {
  const apply = vi.fn<ReligionDeityRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_religion_deity tool", () => {
  it("sets deity by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 2 ? { i: 2, name: "Brightpath", previousDeity: "Old One" } : null,
    );
    const tool = createSetReligionDeityTool(runtime);
    const result = await tool.execute({
      religion: 2,
      deity: "Azoth the Flame-Bearer",
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(2, "Azoth the Flame-Bearer");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 2,
      name: "Brightpath",
      previousDeity: "Old One",
      deity: "Azoth the Flame-Bearer",
    });
  });

  it("sets deity by case-insensitive name", async () => {
    const find = vi.fn<ReligionDeityRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "old faith"
        ? { i: 1, name: "Old Faith", previousDeity: null }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetReligionDeityTool(runtime);
    await tool.execute({ religion: "OLD FAITH", deity: "The Green Mother" });
    expect(find).toHaveBeenCalledWith("OLD FAITH");
    expect(apply).toHaveBeenCalledWith(1, "The Green Mother");
  });

  it("trims non-empty deity", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDeity: null,
    }));
    const tool = createSetReligionDeityTool(runtime);
    await tool.execute({ religion: 1, deity: "  Azoth  " });
    expect(apply).toHaveBeenCalledWith(1, "Azoth");
  });

  it("allows empty string to clear the deity", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDeity: "Azoth",
    }));
    const tool = createSetReligionDeityTool(runtime);
    const result = await tool.execute({ religion: 1, deity: "" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, "");
    expect(JSON.parse(result.content).deity).toBe("");
  });

  it("rejects whitespace-only deity", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDeity: null,
    }));
    const tool = createSetReligionDeityTool(runtime);
    const result = await tool.execute({ religion: 1, deity: "   \n  " });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-string deity", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDeity: null,
    }));
    const tool = createSetReligionDeityTool(runtime);
    for (const bad of [null, undefined, 42, {}]) {
      const r = await tool.execute({ religion: 1, deity: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid religion refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetReligionDeityTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ religion: bad, deity: "Azoth" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses to set deity on religion 0", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 0,
      name: "No religion",
      previousDeity: null,
    }));
    const tool = createSetReligionDeityTool(runtime);
    const result = await tool.execute({ religion: 0, deity: "Nothing" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when the religion is unknown", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetReligionDeityTool(runtime);
    const result = await tool.execute({ religion: 999, deity: "x" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: ReligionDeityRuntime = {
      find: () => ({ i: 1, name: "x", previousDeity: null }),
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetReligionDeityTool(runtime);
    const result = await tool.execute({ religion: 1, deity: "Azoth" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultReligionDeityRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      religions: [
        { i: 0, name: "No religion", removed: true },
        { i: 1, name: "Old Faith", deity: null },
        { i: 2, name: "Brightpath", deity: "Lord of Light" },
      ] satisfies RawReligion[],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("sets deity in the live pack", async () => {
    const result = await setReligionDeityTool.execute({
      religion: 1,
      deity: "The Green Mother",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { religions: RawReligion[] } }).pack;
    expect(pack.religions[1]?.deity).toBe("The Green Mother");
  });

  it("clears deity with empty string", async () => {
    const result = await setReligionDeityTool.execute({
      religion: 2,
      deity: "",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { religions: RawReligion[] } }).pack;
    expect(pack.religions[2]?.deity).toBe("");
  });

  it("refuses when the religion is removed", async () => {
    const pack = (globalThis as { pack: { religions: RawReligion[] } }).pack;
    if (pack.religions[2]) pack.religions[2].removed = true;
    const result = await setReligionDeityTool.execute({
      religion: 2,
      deity: "X",
    });
    expect(result.isError).toBe(true);
  });
});
