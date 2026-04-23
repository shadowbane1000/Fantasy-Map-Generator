import { describe, expect, it } from "vitest";
import {
  createListEmblemShapesTool,
  type EmblemShapeEntry,
  type EmblemShapesListRuntime,
  listEmblemShapesTool,
} from "./list-emblem-shapes";
import { CULTURE_SHIELDS } from "./set-culture-shield";

function makeRuntime(ids: readonly string[]): EmblemShapesListRuntime {
  return { readShapeIds: () => ids };
}

describe("list_emblem_shapes tool", () => {
  it("returns every shape from the default runtime in CULTURE_SHIELDS order", async () => {
    const tool = createListEmblemShapesTool();
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content) as {
      ok: boolean;
      shapes: EmblemShapeEntry[];
      count: number;
    };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(CULTURE_SHIELDS.length);
    expect(body.shapes).toHaveLength(CULTURE_SHIELDS.length);
    expect(body.shapes.map((s) => s.id)).toEqual([...CULTURE_SHIELDS]);
    for (const s of body.shapes) {
      expect(s.name).toBe(s.id);
    }
  });

  it("count matches shapes length", async () => {
    const tool = createListEmblemShapesTool(makeRuntime(["heater", "swiss"]));
    const body = JSON.parse((await tool.execute({})).content) as {
      shapes: EmblemShapeEntry[];
      count: number;
    };
    expect(body.count).toBe(body.shapes.length);
    expect(body.count).toBe(2);
  });

  it("accepts no-args / null / undefined input uniformly", async () => {
    const tool = createListEmblemShapesTool();
    for (const input of [{}, null, undefined]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content) as {
        ok: boolean;
        count: number;
      };
      expect(body.ok).toBe(true);
      expect(body.count).toBe(CULTURE_SHIELDS.length);
    }
  });

  it("preserves the order supplied by the runtime", async () => {
    const tool = createListEmblemShapesTool(
      makeRuntime(["round", "noldor", "heater"]),
    );
    const body = JSON.parse((await tool.execute({})).content) as {
      shapes: EmblemShapeEntry[];
    };
    expect(body.shapes.map((s) => s.id)).toEqual(["round", "noldor", "heater"]);
  });

  it("honours a stubbed subset runtime", async () => {
    const tool = createListEmblemShapesTool(makeRuntime(["wedged", "swiss"]));
    const body = JSON.parse((await tool.execute({})).content) as {
      shapes: EmblemShapeEntry[];
      count: number;
    };
    expect(body.count).toBe(2);
    expect(body.shapes).toEqual([
      { id: "wedged", name: "wedged" },
      { id: "swiss", name: "swiss" },
    ]);
  });

  it("propagates a throwing runtime (ToolRegistry wraps errors upstream)", () => {
    const tool = createListEmblemShapesTool({
      readShapeIds: () => {
        throw new Error("nope");
      },
    });
    expect(() => tool.execute({})).toThrow(/nope/);
  });
});

describe("defaultEmblemShapesListRuntime (integration)", () => {
  it("the shipped tool returns every CULTURE_SHIELDS entry", async () => {
    const result = await listEmblemShapesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content) as {
      ok: boolean;
      shapes: EmblemShapeEntry[];
      count: number;
    };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(CULTURE_SHIELDS.length);
    expect(body.shapes.map((s) => s.id)).toEqual([...CULTURE_SHIELDS]);
  });

  it("contains known shield keys", async () => {
    const body = JSON.parse(
      (await listEmblemShapesTool.execute(undefined)).content,
    ) as { shapes: EmblemShapeEntry[] };
    const ids = body.shapes.map((s) => s.id);
    for (const known of [
      "heater",
      "swiss",
      "wedged",
      "noldor",
      "round",
      "fantasy1",
    ]) {
      expect(ids).toContain(known);
    }
  });

  it("does NOT contain the meta 'types' key", async () => {
    const body = JSON.parse(
      (await listEmblemShapesTool.execute({})).content,
    ) as {
      shapes: EmblemShapeEntry[];
    };
    expect(body.shapes.map((s) => s.id)).not.toContain("types");
  });

  it("every id is unique and non-empty; name equals id", async () => {
    const body = JSON.parse(
      (await listEmblemShapesTool.execute({})).content,
    ) as {
      shapes: EmblemShapeEntry[];
    };
    const ids = body.shapes.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    for (const s of body.shapes) {
      expect(typeof s.id).toBe("string");
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.name).toBe(s.id);
    }
  });
});
