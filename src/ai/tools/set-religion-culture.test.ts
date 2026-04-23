import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawCulture, RawReligion } from "./_shared";
import {
  type CultureTarget,
  createSetReligionCultureTool,
  type ReligionCultureRef,
  type ReligionCultureRuntime,
  setReligionCultureTool,
} from "./set-religion-culture";

function makeRuntime(
  findReligion: (ref: number | string) => ReligionCultureRef | null,
  findCulture: (ref: number | string) => CultureTarget | null,
): {
  runtime: ReligionCultureRuntime;
  apply: ReturnType<typeof vi.fn<ReligionCultureRuntime["apply"]>>;
} {
  const apply = vi.fn<ReligionCultureRuntime["apply"]>();
  return {
    runtime: { findReligion, findCulture, apply },
    apply,
  };
}

describe("set_religion_culture tool", () => {
  it("sets by ids", async () => {
    const { runtime, apply } = makeRuntime(
      (ref) =>
        ref === 1
          ? {
              i: 1,
              name: "Old Faith",
              previousCultureId: 0,
              previousCultureName: "Wildlands",
            }
          : null,
      (ref) => (ref === 2 ? { i: 2, name: "Coastalfolk" } : null),
    );
    const tool = createSetReligionCultureTool(runtime);
    const result = await tool.execute({ religion: 1, culture: 2 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 2);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      name: "Old Faith",
      previousCulture: { id: 0, name: "Wildlands" },
      culture: { id: 2, name: "Coastalfolk" },
    });
  });

  it("sets by names", async () => {
    const findReligion = vi.fn<ReligionCultureRuntime["findReligion"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "old faith"
        ? {
            i: 1,
            name: "Old Faith",
            previousCultureId: 0,
            previousCultureName: "Wildlands",
          }
        : null,
    );
    const findCulture = vi.fn<ReligionCultureRuntime["findCulture"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "highlanders"
        ? { i: 2, name: "Highlanders" }
        : null,
    );
    const { runtime, apply } = makeRuntime(findReligion, findCulture);
    const tool = createSetReligionCultureTool(runtime);
    await tool.execute({ religion: "OLD FAITH", culture: "highlanders" });
    expect(findReligion).toHaveBeenCalledWith("OLD FAITH");
    expect(findCulture).toHaveBeenCalledWith("highlanders");
    expect(apply).toHaveBeenCalledWith(1, 2);
  });

  it("allows Wildlands (culture 0)", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({
        i: 1,
        name: "Old Faith",
        previousCultureId: 2,
        previousCultureName: "Coastalfolk",
      }),
      (ref) => (ref === 0 ? { i: 0, name: "Wildlands" } : null),
    );
    const tool = createSetReligionCultureTool(runtime);
    const result = await tool.execute({ religion: 1, culture: 0 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 0);
  });

  it("rejects religion 0 via valid-ref guard", async () => {
    const { runtime, apply } = makeRuntime(
      () => null,
      () => ({ i: 1, name: "x" }),
    );
    const tool = createSetReligionCultureTool(runtime);
    const result = await tool.execute({ religion: 0, culture: 1 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects religion 0 even when runtime returns one", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({
        i: 0,
        name: "No religion",
        previousCultureId: 0,
        previousCultureName: "Wildlands",
      }),
      () => ({ i: 1, name: "Highlanders" }),
    );
    const tool = createSetReligionCultureTool(runtime);
    const result = await tool.execute({ religion: "No religion", culture: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/religion 0/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid refs", async () => {
    const { runtime, apply } = makeRuntime(
      () => null,
      () => null,
    );
    const tool = createSetReligionCultureTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      expect((await tool.execute({ religion: bad, culture: 0 })).isError).toBe(
        true,
      );
      expect((await tool.execute({ religion: 1, culture: bad })).isError).toBe(
        true,
      );
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors on unknown religion / culture", async () => {
    const { runtime, apply } = makeRuntime(
      () => null,
      () => ({ i: 1, name: "x" }),
    );
    const tool = createSetReligionCultureTool(runtime);
    expect((await tool.execute({ religion: 999, culture: 1 })).isError).toBe(
      true,
    );

    const { runtime: r2 } = makeRuntime(
      () => ({
        i: 1,
        name: "x",
        previousCultureId: 0,
        previousCultureName: null,
      }),
      () => null,
    );
    const tool2 = createSetReligionCultureTool(r2);
    expect((await tool2.execute({ religion: 1, culture: 999 })).isError).toBe(
      true,
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: ReligionCultureRuntime = {
      findReligion: () => ({
        i: 1,
        name: "x",
        previousCultureId: 0,
        previousCultureName: null,
      }),
      findCulture: () => ({ i: 1, name: "y" }),
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetReligionCultureTool(runtime);
    const result = await tool.execute({ religion: 1, culture: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultReligionCultureRuntime (integration)", () => {
  const originalPack = (globalThis as unknown as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = {
      religions: [
        { i: 0, name: "No religion", removed: true },
        { i: 1, name: "Old Faith", culture: 0 },
        { i: 2, name: "Brightpath", culture: 1 },
      ] satisfies RawReligion[],
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Highlanders" },
        { i: 2, name: "Coastalfolk" },
      ] satisfies RawCulture[],
    };
  });

  afterEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
  });

  it("sets religion.culture in the live pack", async () => {
    const result = await setReligionCultureTool.execute({
      religion: 1,
      culture: 2,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as { pack: { religions: RawReligion[] } }
    ).pack;
    expect(pack.religions[1]?.culture).toBe(2);
  });

  it("allows Wildlands (culture 0)", async () => {
    const result = await setReligionCultureTool.execute({
      religion: 2,
      culture: 0,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as { pack: { religions: RawReligion[] } }
    ).pack;
    expect(pack.religions[2]?.culture).toBe(0);
  });

  it("refuses a removed culture", async () => {
    const pack = (globalThis as unknown as { pack: { cultures: RawCulture[] } })
      .pack;
    if (pack.cultures[1]) pack.cultures[1].removed = true;
    const result = await setReligionCultureTool.execute({
      religion: 1,
      culture: 1,
    });
    expect(result.isError).toBe(true);
  });

  it("refuses a removed religion", async () => {
    const pack = (
      globalThis as unknown as { pack: { religions: RawReligion[] } }
    ).pack;
    if (pack.religions[1]) pack.religions[1].removed = true;
    const result = await setReligionCultureTool.execute({
      religion: 1,
      culture: 2,
    });
    expect(result.isError).toBe(true);
  });

  it("rejects 'No religion' (id 0)", async () => {
    const result = await setReligionCultureTool.execute({
      religion: "No religion",
      culture: 1,
    });
    expect(result.isError).toBe(true);
  });
});
