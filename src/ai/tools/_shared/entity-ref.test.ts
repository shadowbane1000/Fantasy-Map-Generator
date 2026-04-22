import { describe, expect, it } from "vitest";
import { parseEntityRef } from "./entity-ref";

describe("parseEntityRef", () => {
  it("accepts a positive integer id", () => {
    expect(parseEntityRef(1, "state")).toEqual({ ok: true, ref: 1 });
    expect(parseEntityRef(42, "burg")).toEqual({ ok: true, ref: 42 });
  });

  it("accepts a non-empty name string", () => {
    expect(parseEntityRef("Altaria", "state")).toEqual({
      ok: true,
      ref: "Altaria",
    });
    expect(parseEntityRef("  Spaced  ", "burg")).toEqual({
      ok: true,
      ref: "  Spaced  ", // unchanged; finders handle trimming
    });
  });

  it("rejects non-integer numbers, zero, and negatives", () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = parseEntityRef(bad, "state");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/state/);
    }
  });

  it("rejects empty / whitespace-only strings", () => {
    for (const bad of ["", "   "]) {
      const r = parseEntityRef(bad, "burg");
      expect(r.ok).toBe(false);
    }
  });

  it("rejects non-string / non-number values", () => {
    for (const bad of [null, undefined, true, {}, [], Symbol("x")]) {
      const r = parseEntityRef(bad, "x");
      expect(r.ok).toBe(false);
    }
  });

  it("uses the provided field name in the error", () => {
    const r = parseEntityRef(null, "province");
    if (r.ok) throw new Error("expected error");
    expect(r.error).toMatch(/^province /);
    expect(r.error).toMatch(/positive integer id or a non-empty name/);
  });
});
