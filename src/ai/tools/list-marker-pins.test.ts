import { describe, expect, it } from "vitest";
import {
  createListMarkerPinsTool,
  listMarkerPinsTool,
  type MarkerPinEntry,
  type MarkerPinListRuntime,
} from "./list-marker-pins";
import { MARKER_PIN_SHAPES } from "./set-marker-pin";

function makeRuntime(ids: readonly string[]): MarkerPinListRuntime {
  return { readPinIds: () => ids };
}

function throwingRuntime(): MarkerPinListRuntime {
  return {
    readPinIds: () => {
      throw new Error("nope");
    },
  };
}

describe("list_marker_pins tool", () => {
  it("returns the 13 canonical pins in canonical order by default", async () => {
    const tool = createListMarkerPinsTool();
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content) as {
      ok: boolean;
      pins: MarkerPinEntry[];
      count: number;
    };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(MARKER_PIN_SHAPES.length);
    expect(body.pins).toHaveLength(MARKER_PIN_SHAPES.length);
    expect(body.pins.map((p) => p.id)).toEqual([...MARKER_PIN_SHAPES]);
    for (const p of body.pins) {
      expect(p.name).toBe(p.id);
    }
  });

  it("count matches pins length", async () => {
    const tool = createListMarkerPinsTool(makeRuntime(["bubble", "pin"]));
    const body = JSON.parse((await tool.execute({})).content) as {
      pins: MarkerPinEntry[];
      count: number;
    };
    expect(body.count).toBe(body.pins.length);
    expect(body.count).toBe(2);
  });

  it("accepts no-args / null / undefined input uniformly", async () => {
    const tool = createListMarkerPinsTool();
    for (const input of [{}, null, undefined]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content) as { ok: boolean; count: number };
      expect(body.ok).toBe(true);
      expect(body.count).toBe(MARKER_PIN_SHAPES.length);
    }
  });

  it("preserves the order supplied by the runtime", async () => {
    const tool = createListMarkerPinsTool(
      makeRuntime(["circle", "diamond", "bubble"]),
    );
    const body = JSON.parse((await tool.execute({})).content) as {
      pins: MarkerPinEntry[];
    };
    expect(body.pins.map((p) => p.id)).toEqual(["circle", "diamond", "bubble"]);
  });

  it("honours a stubbed subset runtime", async () => {
    const tool = createListMarkerPinsTool(makeRuntime(["shield", "pentagon"]));
    const body = JSON.parse((await tool.execute({})).content) as {
      pins: MarkerPinEntry[];
      count: number;
    };
    expect(body.count).toBe(2);
    expect(body.pins).toEqual([
      { id: "shield", name: "shield" },
      { id: "pentagon", name: "pentagon" },
    ]);
  });

  it("propagates a throwing runtime (ToolRegistry wraps errors upstream)", () => {
    const tool = createListMarkerPinsTool({
      readPinIds: throwingRuntime().readPinIds,
    });
    expect(() => tool.execute({})).toThrow(/nope/);
  });
});

describe("defaultMarkerPinListRuntime (integration)", () => {
  it("the shipped tool returns the canonical 13 shapes", async () => {
    const result = await listMarkerPinsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content) as {
      ok: boolean;
      pins: MarkerPinEntry[];
      count: number;
    };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(MARKER_PIN_SHAPES.length);
    expect(body.pins.map((p) => p.id)).toEqual([...MARKER_PIN_SHAPES]);
  });

  it("exposes 'bubble' first (matches set_marker_pin default)", async () => {
    const body = JSON.parse(
      (await listMarkerPinsTool.execute(undefined)).content,
    ) as { pins: MarkerPinEntry[] };
    expect(body.pins[0]?.id).toBe("bubble");
  });

  it("every canonical id appears exactly once", async () => {
    const body = JSON.parse((await listMarkerPinsTool.execute({})).content) as {
      pins: MarkerPinEntry[];
    };
    const ids = body.pins.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    for (const shape of MARKER_PIN_SHAPES) {
      expect(unique.has(shape)).toBe(true);
    }
  });
});
