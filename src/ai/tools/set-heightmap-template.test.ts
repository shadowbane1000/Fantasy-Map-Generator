import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetHeightmapTemplateTool,
  DISPLAY_NAMES,
  defaultHeightmapTemplateRuntime,
  type HeightmapTemplateRuntime,
  resolveTemplateKey,
  TEMPLATE_KEYS,
} from "./set-heightmap-template";

function makeRuntime(previous: string | null = "continents") {
  const read = vi.fn<HeightmapTemplateRuntime["read"]>(() => ({
    template: previous,
  }));
  const write = vi.fn<HeightmapTemplateRuntime["write"]>();
  const runtime: HeightmapTemplateRuntime = { read, write };
  return { runtime, read, write };
}

describe("set_heightmap_template tool", () => {
  it("accepts a canonical key", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetHeightmapTemplateTool(runtime);
    const result = await tool.execute({ template: "archipelago" });
    expect(result.isError).toBeFalsy();
    expect(write).toHaveBeenCalledWith("archipelago");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previousTemplate: "continents",
      template: "archipelago",
      displayName: "Archipelago",
    });
  });

  it("accepts a display name (case-insensitive, whitespace-flexible)", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetHeightmapTemplateTool(runtime);
    for (const input of ["Old World", "old world", "  OLD   WORLD  "]) {
      write.mockClear();
      await tool.execute({ template: input });
      expect(write).toHaveBeenCalledWith("oldWorld");
    }
  });

  it("accepts every canonical key and display name", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetHeightmapTemplateTool(runtime);
    for (const key of TEMPLATE_KEYS) {
      write.mockClear();
      await tool.execute({ template: key });
      expect(write).toHaveBeenCalledWith(key);
      write.mockClear();
      await tool.execute({ template: DISPLAY_NAMES[key] });
      expect(write).toHaveBeenCalledWith(key);
    }
  });

  it("rejects an unknown template with a supported list", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetHeightmapTemplateTool(runtime);
    const result = await tool.execute({ template: "saturnian" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.supported).toEqual([...TEMPLATE_KEYS]);
    expect(body.displayNames).toContain("Archipelago");
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects non-string / empty inputs", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetHeightmapTemplateTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      expect((await tool.execute({ template: bad })).isError).toBe(true);
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime();
    runtime.write = vi.fn(() => {
      throw new Error("#templateInput is not available yet");
    });
    const tool = createSetHeightmapTemplateTool(runtime);
    const result = await tool.execute({ template: "volcano" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
  });

  it("reports previousTemplate from runtime.read", async () => {
    const { runtime } = makeRuntime("pangea");
    const tool = createSetHeightmapTemplateTool(runtime);
    const result = await tool.execute({ template: "volcano" });
    expect(JSON.parse(result.content).previousTemplate).toBe("pangea");
  });
});

type StubOption = { value: string; text: string };
type StubSelect = {
  _value: string;
  _options: StubOption[];
  value: string;
  options: StubOption[] & { add: (opt: StubOption) => void };
};

function createStubSelect(initial: StubOption[] = []): StubSelect {
  const opts = [...initial];
  const optionsList = Object.assign(opts, {
    add: (opt: StubOption) => {
      opts.push(opt);
    },
  });
  const sel = {
    _value: "",
    _options: opts,
    options: optionsList,
    get value(): string {
      return this._value;
    },
    set value(v: string) {
      // Mirror real <select>: silently drop unknown values.
      if (opts.some((o) => o.value === v)) this._value = v;
    },
  };
  return sel as StubSelect;
}

describe("defaultHeightmapTemplateRuntime", () => {
  type Globals = {
    document?: unknown;
    window?: unknown;
    Option?: unknown;
  };
  const original: Globals = {};

  beforeEach(() => {
    const g = globalThis as Globals;
    original.document = g.document;
    original.window = g.window;
    original.Option = g.Option;
    g.Option = function StubOptionCtor(text: string, value: string) {
      return { text, value };
    } as unknown as typeof Option;
  });

  afterEach(() => {
    const g = globalThis as Globals;
    g.document = original.document;
    g.window = original.window;
    g.Option = original.Option;
  });

  it("adds the option if missing and sets value", () => {
    const sel = createStubSelect([
      { value: "highIsland", text: "High Island" },
    ]);
    const lockCalls: string[] = [];
    (globalThis as Globals).document = {
      getElementById: (id: string) => (id === "templateInput" ? sel : null),
    };
    (globalThis as Globals).window = {
      heightmapTemplates: { pangea: { name: "Pangea" } },
      // lock is intentionally present to prove we do NOT auto-call it.
      lock: (id: string) => {
        lockCalls.push(id);
      },
    };

    defaultHeightmapTemplateRuntime.write("pangea");

    expect(sel._options).toContainEqual({ value: "pangea", text: "Pangea" });
    expect(sel.value).toBe("pangea");
    expect(lockCalls).toEqual([]);
  });

  it("falls back to DISPLAY_NAMES when window.heightmapTemplates is missing", () => {
    const sel = createStubSelect();
    (globalThis as Globals).document = {
      getElementById: () => sel,
    };
    (globalThis as Globals).window = {};

    defaultHeightmapTemplateRuntime.write("oldWorld");

    expect(sel._options).toContainEqual({
      value: "oldWorld",
      text: "Old World",
    });
    expect(sel.value).toBe("oldWorld");
  });

  it("does not duplicate an existing option", () => {
    const sel = createStubSelect([
      { value: "highIsland", text: "High Island" },
      { value: "pangea", text: "Pangea" },
    ]);
    (globalThis as Globals).document = { getElementById: () => sel };
    (globalThis as Globals).window = { lock: () => {} };

    defaultHeightmapTemplateRuntime.write("pangea");

    expect(sel._options.length).toBe(2);
    expect(sel.value).toBe("pangea");
  });

  it("succeeds when window is unavailable", () => {
    const sel = createStubSelect();
    (globalThis as Globals).document = { getElementById: () => sel };
    (globalThis as Globals).window = {};

    expect(() =>
      defaultHeightmapTemplateRuntime.write("volcano"),
    ).not.toThrow();
    expect(sel.value).toBe("volcano");
  });

  it("throws if #templateInput is missing", () => {
    (globalThis as Globals).document = { getElementById: () => null };
    (globalThis as Globals).window = {};

    expect(() => defaultHeightmapTemplateRuntime.write("volcano")).toThrow(
      /templateInput/,
    );
  });

  it("read returns the current value or null when empty / missing", () => {
    const sel = createStubSelect([{ value: "pangea", text: "Pangea" }]);
    sel.value = "pangea";
    (globalThis as Globals).document = { getElementById: () => sel };
    expect(defaultHeightmapTemplateRuntime.read()).toEqual({
      template: "pangea",
    });

    (globalThis as Globals).document = { getElementById: () => null };
    expect(defaultHeightmapTemplateRuntime.read()).toEqual({ template: null });
  });
});

describe("resolveTemplateKey", () => {
  it("resolves every canonical key and display name", () => {
    for (const key of TEMPLATE_KEYS) {
      expect(resolveTemplateKey(key)).toBe(key);
      expect(resolveTemplateKey(DISPLAY_NAMES[key])).toBe(key);
      expect(resolveTemplateKey(DISPLAY_NAMES[key].toLowerCase())).toBe(key);
      expect(
        resolveTemplateKey(`  ${DISPLAY_NAMES[key].toUpperCase()}  `),
      ).toBe(key);
    }
  });

  it("returns null for unknown / invalid inputs", () => {
    expect(resolveTemplateKey("saturnian")).toBeNull();
    expect(resolveTemplateKey("")).toBeNull();
    expect(resolveTemplateKey("   ")).toBeNull();
    expect(resolveTemplateKey(42)).toBeNull();
    expect(resolveTemplateKey(null)).toBeNull();
    expect(resolveTemplateKey(undefined)).toBeNull();
  });
});
