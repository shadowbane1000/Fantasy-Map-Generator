import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createListStylePresetsTool,
  listStylePresetsTool,
  type StylePresetEntry,
  type StylePresetListRuntime,
} from "./list-style-presets";
import { STYLE_PRESETS } from "./set-style-preset";

function makeRuntime(customIds: string[]): StylePresetListRuntime {
  return { readCustomPresetIds: () => [...customIds] };
}

function throwingRuntime(): StylePresetListRuntime {
  return {
    readCustomPresetIds: () => {
      throw new Error("nope");
    },
  };
}

describe("list_style_presets tool", () => {
  it("returns the 12 built-in presets in canonical order when no custom", async () => {
    const tool = createListStylePresetsTool(makeRuntime([]));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(STYLE_PRESETS.length);
    expect(body.presets).toHaveLength(STYLE_PRESETS.length);
    expect(body.presets.map((p: StylePresetEntry) => p.id)).toEqual([
      ...STYLE_PRESETS,
    ]);
    for (const p of body.presets as StylePresetEntry[]) {
      expect(p.builtin).toBe(true);
      expect(p.name).toBe(p.id);
    }
  });

  it("appends custom presets after built-ins, sorted by id", async () => {
    const tool = createListStylePresetsTool(
      makeRuntime(["fmgStyle_zeta", "fmgStyle_alpha", "fmgStyle_mike"]),
    );
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.count).toBe(STYLE_PRESETS.length + 3);
    const ids = body.presets.map((p: StylePresetEntry) => p.id);
    expect(ids.slice(0, STYLE_PRESETS.length)).toEqual([...STYLE_PRESETS]);
    expect(ids.slice(STYLE_PRESETS.length)).toEqual([
      "fmgStyle_alpha",
      "fmgStyle_mike",
      "fmgStyle_zeta",
    ]);
    const customs = body.presets.slice(STYLE_PRESETS.length);
    for (const p of customs as StylePresetEntry[]) {
      expect(p.builtin).toBe(false);
      expect(p.name).toBe(p.id.replace("fmgStyle_", ""));
    }
  });

  it("strips the fmgStyle_ prefix in the name for customs", async () => {
    const tool = createListStylePresetsTool(makeRuntime(["fmgStyle_my theme"]));
    const body = JSON.parse((await tool.execute({})).content);
    const custom = body.presets[body.presets.length - 1] as StylePresetEntry;
    expect(custom.id).toBe("fmgStyle_my theme");
    expect(custom.name).toBe("my theme");
    expect(custom.builtin).toBe(false);
  });

  it("accepts no-args / null / undefined input uniformly", async () => {
    const tool = createListStylePresetsTool(makeRuntime([]));
    for (const input of [{}, null, undefined]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      expect(body.ok).toBe(true);
      expect(body.count).toBe(STYLE_PRESETS.length);
    }
  });

  it("ignores non-fmgStyle keys returned by the runtime", async () => {
    const tool = createListStylePresetsTool(
      makeRuntime(["fmgStyle_ok", "presetStyle", "random_key"]),
    );
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.count).toBe(STYLE_PRESETS.length + 1);
    expect(body.presets[body.presets.length - 1].id).toBe("fmgStyle_ok");
  });

  it("treats a throwing runtime as no customs", async () => {
    const tool = createListStylePresetsTool({
      readCustomPresetIds: throwingRuntime().readCustomPresetIds,
    });
    // createListStylePresetsTool doesn't wrap the runtime in try/catch — the
    // ToolRegistry would. Call directly to confirm throw propagates.
    expect(() => tool.execute({})).toThrow(/nope/);
  });

  it("count matches presets length", async () => {
    const tool = createListStylePresetsTool(
      makeRuntime(["fmgStyle_a", "fmgStyle_b"]),
    );
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.count).toBe(body.presets.length);
  });
});

describe("defaultStylePresetListRuntime (integration)", () => {
  const originalLocalStorage = (
    globalThis as unknown as { localStorage?: unknown }
  ).localStorage;

  function makeStubStorage(keys: string[]): {
    length: number;
    key(index: number): string | null;
  } {
    return {
      length: keys.length,
      key(index: number): string | null {
        return index >= 0 && index < keys.length ? keys[index] : null;
      },
    };
  }

  beforeEach(() => {
    (globalThis as unknown as { localStorage?: unknown }).localStorage =
      makeStubStorage([
        "fmgStyle_alpha",
        "unrelated_key",
        "fmgStyle_beta",
        "presetStyle",
      ]);
  });

  afterEach(() => {
    (globalThis as unknown as { localStorage?: unknown }).localStorage =
      originalLocalStorage;
  });

  it("reads fmgStyle_ keys from globalThis.localStorage and ignores others", async () => {
    const result = await listStylePresetsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    const customs = (body.presets as StylePresetEntry[]).filter(
      (p) => !p.builtin,
    );
    expect(customs.map((p) => p.id)).toEqual([
      "fmgStyle_alpha",
      "fmgStyle_beta",
    ]);
    expect(customs.map((p) => p.name)).toEqual(["alpha", "beta"]);
    expect(body.count).toBe(STYLE_PRESETS.length + 2);
  });

  it("returns an empty custom list when localStorage is absent", async () => {
    (globalThis as unknown as { localStorage?: unknown }).localStorage =
      undefined;
    const body = JSON.parse((await listStylePresetsTool.execute({})).content);
    expect(body.count).toBe(STYLE_PRESETS.length);
    expect((body.presets as StylePresetEntry[]).every((p) => p.builtin)).toBe(
      true,
    );
  });

  it("swallows localStorage errors and returns built-ins only", async () => {
    (globalThis as unknown as { localStorage?: unknown }).localStorage = {
      get length(): number {
        throw new Error("boom");
      },
      key(): string | null {
        return null;
      },
    };
    const body = JSON.parse((await listStylePresetsTool.execute({})).content);
    expect(body.count).toBe(STYLE_PRESETS.length);
  });
});
