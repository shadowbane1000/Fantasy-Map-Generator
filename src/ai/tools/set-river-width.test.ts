import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRiver } from "./_shared";
import {
  createSetRiverWidthTool,
  type RiverWidthRef,
  type RiverWidthRuntime,
  setRiverWidthTool,
} from "./set-river-width";

function makeRuntime(find: (ref: number | string) => RiverWidthRef | null): {
  runtime: RiverWidthRuntime;
  apply: ReturnType<typeof vi.fn<RiverWidthRuntime["apply"]>>;
} {
  const apply = vi.fn<RiverWidthRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_river_width tool", () => {
  it("sets sourceWidth only", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Silver",
      previousSourceWidth: 0,
      previousWidthFactor: 1,
    }));
    const tool = createSetRiverWidthTool(runtime);
    const result = await tool.execute({ river: 5, sourceWidth: 1.5 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, {
      sourceWidth: 1.5,
      widthFactor: undefined,
    });
    const body = JSON.parse(result.content);
    expect(body.sourceWidth).toBe(1.5);
    expect(body.widthFactor).toBe(1);
    expect(body.noop).toBe(false);
  });

  it("sets widthFactor only", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousSourceWidth: 0,
      previousWidthFactor: 1,
    }));
    const tool = createSetRiverWidthTool(runtime);
    await tool.execute({ river: 5, widthFactor: 2 });
    expect(apply).toHaveBeenCalledWith(5, {
      sourceWidth: undefined,
      widthFactor: 2,
    });
  });

  it("sets both", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousSourceWidth: 0,
      previousWidthFactor: 1,
    }));
    const tool = createSetRiverWidthTool(runtime);
    await tool.execute({ river: 5, sourceWidth: 1.2, widthFactor: 2 });
    expect(apply).toHaveBeenCalledWith(5, {
      sourceWidth: 1.2,
      widthFactor: 2,
    });
  });

  it("rejects missing both fields", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRiverWidthTool(runtime);
    const result = await tool.execute({ river: 5 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects out-of-range sourceWidth", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRiverWidthTool(runtime);
    for (const bad of [-1, 4, 100]) {
      const r = await tool.execute({ river: 5, sourceWidth: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects out-of-range widthFactor", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRiverWidthTool(runtime);
    for (const bad of [0, 0.05, 4.5, 100]) {
      const r = await tool.execute({ river: 5, widthFactor: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-finite / non-number values", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRiverWidthTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, "1"]) {
      const r = await tool.execute({ river: 5, sourceWidth: bad });
      expect(r.isError).toBe(true);
    }
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, "1"]) {
      const r = await tool.execute({ river: 5, widthFactor: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid river refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRiverWidthTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ river: bad, sourceWidth: 1 });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown river", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRiverWidthTool(runtime);
    const result = await tool.execute({ river: 999, sourceWidth: 1 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("is a noop when provided values match current", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousSourceWidth: 1.5,
      previousWidthFactor: 2,
    }));
    const tool = createSetRiverWidthTool(runtime);
    const result = await tool.execute({
      river: 5,
      sourceWidth: 1.5,
      widthFactor: 2,
    });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("surfaces runtime errors", async () => {
    const runtime: RiverWidthRuntime = {
      find: () => ({
        i: 5,
        name: "x",
        previousSourceWidth: 0,
        previousWidthFactor: 1,
      }),
      apply: vi.fn(() => {
        throw new Error("pack.rivers is not available.");
      }),
    };
    const tool = createSetRiverWidthTool(runtime);
    const result = await tool.execute({ river: 5, sourceWidth: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/rivers/);
  });
});

describe("defaultRiverWidthRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      rivers: [
        { i: 0 },
        { i: 1, name: "Silver", sourceWidth: 0.5, widthFactor: 1 },
        { i: 2, name: "Gold", sourceWidth: 1, widthFactor: 2 },
        { i: 9, name: "Gone", removed: true },
      ] satisfies RawRiver[],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("writes sourceWidth and leaves widthFactor untouched", async () => {
    const result = await setRiverWidthTool.execute({
      river: 1,
      sourceWidth: 2,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    const river = pack.rivers.find((r) => r.i === 1);
    expect(river?.sourceWidth).toBe(2);
    expect(river?.widthFactor).toBe(1);
  });

  it("writes both", async () => {
    await setRiverWidthTool.execute({
      river: 2,
      sourceWidth: 1.5,
      widthFactor: 3,
    });
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    const river = pack.rivers.find((r) => r.i === 2);
    expect(river?.sourceWidth).toBe(1.5);
    expect(river?.widthFactor).toBe(3);
  });

  it("rejects a removed river (findRiverByRef skips)", async () => {
    const result = await setRiverWidthTool.execute({
      river: 9,
      sourceWidth: 1,
    });
    expect(result.isError).toBe(true);
  });

  it("resolves by case-insensitive name", async () => {
    await setRiverWidthTool.execute({
      river: "silver",
      sourceWidth: 2,
    });
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    const river = pack.rivers.find((r) => r.i === 1);
    expect(river?.sourceWidth).toBe(2);
  });
});
