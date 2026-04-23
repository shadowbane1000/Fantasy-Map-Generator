import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawReligion } from "./_shared";
import {
  createSetReligionOriginsTool,
  type ReligionCandidateRef,
  type ReligionOriginsRef,
  type ReligionOriginsRuntime,
  setReligionOriginsTool,
} from "./set-religion-origins";

function makeRuntime(options: {
  resolve: (ref: number | string) => ReligionOriginsRef | null;
  candidates?: Record<number, ReligionCandidateRef | null>;
  religionCount?: number;
}) {
  const find = vi.fn(options.resolve);
  const findCandidate = vi.fn<ReligionOriginsRuntime["findCandidate"]>((i) => {
    if (!options.candidates) {
      // Default: every id except 0 is a valid candidate unless it's the reference itself.
      if (i === 0) return null;
      return { i, name: `R${i}`, removed: false };
    }
    return options.candidates[i] ?? null;
  });
  const getReligionCount = vi.fn<ReligionOriginsRuntime["getReligionCount"]>(
    () => options.religionCount ?? 10,
  );
  const apply = vi.fn<ReligionOriginsRuntime["apply"]>();
  const runtime: ReligionOriginsRuntime = {
    find,
    findCandidate,
    getReligionCount,
    apply,
  };
  return { runtime, find, findCandidate, getReligionCount, apply };
}

describe("set_religion_origins tool", () => {
  it("applies a new origins array by religion id", async () => {
    const { runtime, apply } = makeRuntime({
      resolve: (ref) =>
        ref === 3
          ? {
              i: 3,
              name: "Astralism",
              previousOrigins: [0],
              locked: false,
            }
          : null,
    });
    const tool = createSetReligionOriginsTool(runtime);
    const result = await tool.execute({ religion: 3, origins: [1, 2] });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(3, [1, 2]);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 3,
      name: "Astralism",
      previousOrigins: [0],
      origins: [1, 2],
    });
  });

  it("resolves case-insensitive religion name", async () => {
    const { runtime, apply } = makeRuntime({
      resolve: (ref) =>
        typeof ref === "string" && ref.toLowerCase() === "astralism"
          ? { i: 3, name: "Astralism", previousOrigins: [0], locked: false }
          : null,
    });
    const tool = createSetReligionOriginsTool(runtime);
    await tool.execute({ religion: "ASTRALISM", origins: [1] });
    expect(apply).toHaveBeenCalledWith(3, [1]);
  });

  it("normalises an empty array to [0]", async () => {
    const { runtime, apply } = makeRuntime({
      resolve: () => ({
        i: 3,
        name: "Astralism",
        previousOrigins: [1, 2],
        locked: false,
      }),
    });
    const tool = createSetReligionOriginsTool(runtime);
    const result = await tool.execute({ religion: 3, origins: [] });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(3, [0]);
    expect(JSON.parse(result.content).origins).toEqual([0]);
  });

  it("collapses duplicates preserving first-occurrence order", async () => {
    const { runtime, apply } = makeRuntime({
      resolve: () => ({
        i: 3,
        name: "Astralism",
        previousOrigins: [0],
        locked: false,
      }),
    });
    const tool = createSetReligionOriginsTool(runtime);
    await tool.execute({ religion: 3, origins: [2, 1, 2, 1, 4] });
    expect(apply).toHaveBeenCalledWith(3, [2, 1, 4]);
  });

  it("rejects religion 0 (No religion placeholder)", async () => {
    const { runtime, apply } = makeRuntime({
      resolve: () => ({
        i: 0,
        name: "No religion",
        previousOrigins: [0],
        locked: false,
      }),
    });
    const tool = createSetReligionOriginsTool(runtime);
    const result = await tool.execute({ religion: 0, origins: [1] });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects locked religions", async () => {
    const { runtime, apply } = makeRuntime({
      resolve: () => ({
        i: 3,
        name: "Ancients",
        previousOrigins: [0],
        locked: true,
      }),
    });
    const tool = createSetReligionOriginsTool(runtime);
    const result = await tool.execute({ religion: 3, origins: [1] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/locked/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects self-reference", async () => {
    const { runtime, apply } = makeRuntime({
      resolve: () => ({
        i: 2,
        name: "Lunarism",
        previousOrigins: [0],
        locked: false,
      }),
    });
    const tool = createSetReligionOriginsTool(runtime);
    const result = await tool.execute({ religion: 2, origins: [1, 2] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/itself/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects out-of-range origin indices", async () => {
    const { runtime, apply } = makeRuntime({
      resolve: () => ({
        i: 3,
        name: "Astralism",
        previousOrigins: [0],
        locked: false,
      }),
      religionCount: 5,
    });
    const tool = createSetReligionOriginsTool(runtime);
    const result = await tool.execute({ religion: 3, origins: [1, 9] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/out of range/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects removed origin candidates", async () => {
    const { runtime, apply } = makeRuntime({
      resolve: () => ({
        i: 3,
        name: "Astralism",
        previousOrigins: [0],
        locked: false,
      }),
      candidates: {
        1: { i: 1, name: "Solarism", removed: false },
        4: { i: 4, name: "Gone", removed: true },
      },
    });
    const tool = createSetReligionOriginsTool(runtime);
    const result = await tool.execute({ religion: 3, origins: [1, 4] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/removed/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects origin candidates that don't exist", async () => {
    const { runtime, apply } = makeRuntime({
      resolve: () => ({
        i: 3,
        name: "Astralism",
        previousOrigins: [0],
        locked: false,
      }),
      candidates: {
        1: { i: 1, name: "Solarism", removed: false },
        2: null,
      },
    });
    const tool = createSetReligionOriginsTool(runtime);
    const result = await tool.execute({ religion: 3, origins: [1, 2] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/does not exist/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects 0 in a non-first slot", async () => {
    const { runtime, apply } = makeRuntime({
      resolve: () => ({
        i: 3,
        name: "Astralism",
        previousOrigins: [0],
        locked: false,
      }),
    });
    const tool = createSetReligionOriginsTool(runtime);
    const result = await tool.execute({ religion: 3, origins: [1, 0] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/primary/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("accepts 0 in the primary slot", async () => {
    const { runtime, apply } = makeRuntime({
      resolve: () => ({
        i: 3,
        name: "Astralism",
        previousOrigins: [1],
        locked: false,
      }),
    });
    const tool = createSetReligionOriginsTool(runtime);
    const result = await tool.execute({ religion: 3, origins: [0] });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(3, [0]);
  });

  it("rejects non-integer or negative origin entries", async () => {
    const { runtime, apply } = makeRuntime({
      resolve: () => ({
        i: 3,
        name: "Astralism",
        previousOrigins: [0],
        locked: false,
      }),
    });
    const tool = createSetReligionOriginsTool(runtime);
    for (const bad of [[-1], [1.5], [Number.NaN], ["1"], [null], [{}]]) {
      const r = await tool.execute({ religion: 3, origins: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-array origins input", async () => {
    const { runtime, apply } = makeRuntime({
      resolve: () => ({
        i: 3,
        name: "Astralism",
        previousOrigins: [0],
        locked: false,
      }),
    });
    const tool = createSetReligionOriginsTool(runtime);
    for (const bad of [undefined, null, 1, "abc", {}]) {
      const r = await tool.execute({ religion: 3, origins: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid religion ref types", async () => {
    const { runtime, apply } = makeRuntime({ resolve: () => null });
    const tool = createSetReligionOriginsTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      const r = await tool.execute({ religion: bad, origins: [1] });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors for unknown religion refs", async () => {
    const { runtime, apply } = makeRuntime({ resolve: () => null });
    const tool = createSetReligionOriginsTool(runtime);
    const result = await tool.execute({ religion: 999, origins: [1] });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when pack.religions is empty", async () => {
    const { runtime, apply } = makeRuntime({
      resolve: () => ({
        i: 1,
        name: "X",
        previousOrigins: [0],
        locked: false,
      }),
      religionCount: 0,
    });
    const tool = createSetReligionOriginsTool(runtime);
    const result = await tool.execute({ religion: 1, origins: [1] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.religions/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime apply failures", async () => {
    const runtime: ReligionOriginsRuntime = {
      find: () => ({
        i: 3,
        name: "Astralism",
        previousOrigins: [0],
        locked: false,
      }),
      findCandidate: (i) =>
        i === 1 ? { i: 1, name: "Solarism", removed: false } : null,
      getReligionCount: () => 10,
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetReligionOriginsTool(runtime);
    const result = await tool.execute({ religion: 3, origins: [1] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultReligionOriginsRuntime (integration)", () => {
  const originalPack = (globalThis as unknown as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = {
      religions: [
        { i: 0, name: "No religion", removed: true, origins: [] },
        { i: 1, name: "Solarism", origins: [0], lock: false },
        { i: 2, name: "Lunarism", origins: [1], lock: false },
        { i: 3, name: "Astralism", origins: [0], lock: false },
        { i: 4, name: "Ancients", origins: [0], lock: true },
        { i: 5, name: "Gone", removed: true, origins: [1] },
      ] satisfies RawReligion[],
    };
  });

  afterEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
  });

  it("writes religion.origins in the live pack", async () => {
    const result = await setReligionOriginsTool.execute({
      religion: 3,
      origins: [1, 2],
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as { pack: { religions: RawReligion[] } }
    ).pack;
    expect(pack.religions[3]?.origins).toEqual([1, 2]);
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      i: 3,
      previousOrigins: [0],
      origins: [1, 2],
    });
  });

  it("refuses locked religions", async () => {
    const result = await setReligionOriginsTool.execute({
      religion: 4,
      origins: [1],
    });
    expect(result.isError).toBe(true);
    const pack = (
      globalThis as unknown as { pack: { religions: RawReligion[] } }
    ).pack;
    expect(pack.religions[4]?.origins).toEqual([0]);
  });

  it("refuses a removed religion id inside origins", async () => {
    const result = await setReligionOriginsTool.execute({
      religion: 3,
      origins: [5],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/removed/);
    const pack = (
      globalThis as unknown as { pack: { religions: RawReligion[] } }
    ).pack;
    expect(pack.religions[3]?.origins).toEqual([0]);
  });

  it("refuses self-reference", async () => {
    const result = await setReligionOriginsTool.execute({
      religion: 2,
      origins: [2],
    });
    expect(result.isError).toBe(true);
    const pack = (
      globalThis as unknown as { pack: { religions: RawReligion[] } }
    ).pack;
    expect(pack.religions[2]?.origins).toEqual([1]);
  });

  it("refuses out-of-range origin indices", async () => {
    const result = await setReligionOriginsTool.execute({
      religion: 3,
      origins: [99],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/out of range/);
  });

  it("empty array normalises to [0] and writes it", async () => {
    const result = await setReligionOriginsTool.execute({
      religion: 2,
      origins: [],
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as { pack: { religions: RawReligion[] } }
    ).pack;
    expect(pack.religions[2]?.origins).toEqual([0]);
  });

  it("collapses duplicates", async () => {
    const result = await setReligionOriginsTool.execute({
      religion: 3,
      origins: [1, 2, 1, 2],
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as { pack: { religions: RawReligion[] } }
    ).pack;
    expect(pack.religions[3]?.origins).toEqual([1, 2]);
  });

  it("resolves case-insensitive name", async () => {
    const result = await setReligionOriginsTool.execute({
      religion: "astralism",
      origins: [1],
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as unknown as { pack: { religions: RawReligion[] } }
    ).pack;
    expect(pack.religions[3]?.origins).toEqual([1]);
  });
});
