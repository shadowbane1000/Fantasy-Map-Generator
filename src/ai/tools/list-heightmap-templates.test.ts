import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createListHeightmapTemplatesTool,
  type HeightmapListEntry,
  type HeightmapListRuntime,
  listHeightmapTemplatesTool,
  readHeightmapListFromGlobals,
} from "./list-heightmap-templates";

function sampleTemplates(): Record<string, unknown> {
  return {
    volcano: { id: 0, name: "Volcano", template: "…", probability: 3 },
    continents: {
      id: 3,
      name: "Continents",
      template: "…",
      probability: 16,
    },
    oldWorld: { id: 12, name: "Old World", template: "…", probability: 8 },
  };
}

function samplePrecreated(): Record<string, unknown> {
  return {
    "africa-centric": { id: 0, name: "Africa Centric" },
    world: { id: 21, name: "World" },
    britain: { id: 3, name: "Britain" },
  };
}

function makeRuntime(
  templates?: Record<string, unknown>,
  precreated?: Record<string, unknown>,
): HeightmapListRuntime {
  return {
    readTemplates: () => templates,
    readPrecreated: () => precreated,
  };
}

describe("list_heightmap_templates tool", () => {
  it("returns both lists sorted by id", async () => {
    const tool = createListHeightmapTemplatesTool(
      makeRuntime(sampleTemplates(), samplePrecreated()),
    );
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.templates).toEqual<HeightmapListEntry[]>([
      { id: 0, name: "Volcano" },
      { id: 3, name: "Continents" },
      { id: 12, name: "Old World" },
    ]);
    expect(body.precreated).toEqual<HeightmapListEntry[]>([
      { id: 0, name: "Africa Centric" },
      { id: 3, name: "Britain" },
      { id: 21, name: "World" },
    ]);
  });

  it("filters to templates only", async () => {
    const tool = createListHeightmapTemplatesTool(
      makeRuntime(sampleTemplates(), samplePrecreated()),
    );
    const result = await tool.execute({ type: "template" });
    const body = JSON.parse(result.content);
    expect(body.templates).toHaveLength(3);
    expect(body.precreated).toEqual([]);
  });

  it("filters to precreated only", async () => {
    const tool = createListHeightmapTemplatesTool(
      makeRuntime(sampleTemplates(), samplePrecreated()),
    );
    const result = await tool.execute({ type: "precreated" });
    const body = JSON.parse(result.content);
    expect(body.templates).toEqual([]);
    expect(body.precreated).toHaveLength(3);
  });

  it("accepts case-insensitive and whitespace-flexible type values", async () => {
    const tool = createListHeightmapTemplatesTool(
      makeRuntime(sampleTemplates(), samplePrecreated()),
    );
    for (const t of ["TEMPLATE", "  Templates  ", "template"]) {
      const body = JSON.parse((await tool.execute({ type: t })).content);
      expect(body.precreated).toEqual([]);
      expect(body.templates).toHaveLength(3);
    }
    for (const t of [
      "PRECREATED",
      "  Precreated  ",
      "precreated-heightmaps",
      "precreated heightmaps",
    ]) {
      const body = JSON.parse((await tool.execute({ type: t })).content);
      expect(body.templates).toEqual([]);
      expect(body.precreated).toHaveLength(3);
    }
  });

  it("rejects an unknown type string", async () => {
    const tool = createListHeightmapTemplatesTool(
      makeRuntime(sampleTemplates(), samplePrecreated()),
    );
    const result = await tool.execute({ type: "saturnian" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.supported).toEqual(["template", "precreated"]);
  });

  it("rejects non-string type values", async () => {
    const tool = createListHeightmapTemplatesTool(
      makeRuntime(sampleTemplates(), samplePrecreated()),
    );
    for (const bad of [42, true, {}, ""]) {
      const result = await tool.execute({ type: bad });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).supported).toEqual([
        "template",
        "precreated",
      ]);
    }
  });

  it("treats null / undefined type as no filter", async () => {
    const tool = createListHeightmapTemplatesTool(
      makeRuntime(sampleTemplates(), samplePrecreated()),
    );
    for (const t of [null, undefined]) {
      const body = JSON.parse((await tool.execute({ type: t })).content);
      expect(body.templates).toHaveLength(3);
      expect(body.precreated).toHaveLength(3);
    }
  });

  it("handles missing globals gracefully", async () => {
    const tool = createListHeightmapTemplatesTool(
      makeRuntime(undefined, undefined),
    );
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.ok).toBe(true);
    expect(body.templates).toEqual([]);
    expect(body.precreated).toEqual([]);
  });

  it("skips malformed entries", async () => {
    const templates: Record<string, unknown> = {
      ok: { id: 1, name: "Ok" },
      noId: { name: "NoId" },
      noName: { id: 2 },
      emptyName: { id: 3, name: "" },
      nonNumericId: { id: "4", name: "Four" },
      infiniteId: { id: Number.POSITIVE_INFINITY, name: "Inf" },
      nullSlot: null,
      primitive: 7,
    };
    const tool = createListHeightmapTemplatesTool(
      makeRuntime(templates, undefined),
    );
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.templates).toEqual([{ id: 1, name: "Ok" }]);
  });
});

describe("readHeightmapListFromGlobals", () => {
  it("returns empty arrays when inputs are missing", () => {
    expect(readHeightmapListFromGlobals(undefined, undefined)).toEqual({
      templates: [],
      precreated: [],
    });
  });

  it("sorts entries by id regardless of key insertion order", () => {
    const templates: Record<string, unknown> = {
      z: { id: 9, name: "Nine" },
      a: { id: 1, name: "One" },
      m: { id: 5, name: "Five" },
    };
    const out = readHeightmapListFromGlobals(templates, undefined);
    expect(out.templates.map((e) => e.id)).toEqual([1, 5, 9]);
  });

  it("skips entries with non-number id or empty name", () => {
    const input: Record<string, unknown> = {
      good: { id: 2, name: "Good" },
      badId: { id: "nope", name: "Bad" },
      blankName: { id: 3, name: "" },
    };
    const out = readHeightmapListFromGlobals(input, undefined);
    expect(out.templates).toEqual([{ id: 2, name: "Good" }]);
  });
});

describe("defaultHeightmapListRuntime (integration)", () => {
  const originalTemplates = (
    globalThis as unknown as { heightmapTemplates?: unknown }
  ).heightmapTemplates;
  const originalPrecreated = (
    globalThis as unknown as { precreatedHeightmaps?: unknown }
  ).precreatedHeightmaps;

  beforeEach(() => {
    (
      globalThis as unknown as { heightmapTemplates?: unknown }
    ).heightmapTemplates = sampleTemplates();
    (
      globalThis as unknown as { precreatedHeightmaps?: unknown }
    ).precreatedHeightmaps = samplePrecreated();
  });

  afterEach(() => {
    (
      globalThis as unknown as { heightmapTemplates?: unknown }
    ).heightmapTemplates = originalTemplates;
    (
      globalThis as unknown as { precreatedHeightmaps?: unknown }
    ).precreatedHeightmaps = originalPrecreated;
  });

  it("reads heightmapTemplates and precreatedHeightmaps from globalThis", async () => {
    const result = await listHeightmapTemplatesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.templates.map((e: HeightmapListEntry) => e.name)).toEqual([
      "Volcano",
      "Continents",
      "Old World",
    ]);
    expect(body.precreated.map((e: HeightmapListEntry) => e.name)).toEqual([
      "Africa Centric",
      "Britain",
      "World",
    ]);
  });
});
