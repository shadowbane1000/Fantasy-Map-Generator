import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getGlobal, getNotes, getPack, getPackCollection } from "./globals";

describe("global accessors", () => {
  let prev: Record<string, unknown>;
  const KEYS = ["pack", "notes", "seed", "someFunc"] as const;

  beforeEach(() => {
    prev = {};
    for (const k of KEYS) {
      prev[k] = (globalThis as Record<string, unknown>)[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (prev[k] === undefined) {
        delete (globalThis as Record<string, unknown>)[k];
      } else {
        (globalThis as Record<string, unknown>)[k] = prev[k];
      }
    }
  });

  it("getGlobal reads arbitrary global names", () => {
    (globalThis as Record<string, unknown>).seed = "abc";
    expect(getGlobal<string>("seed")).toBe("abc");
    expect(getGlobal<string>("definitelyNotSet")).toBeUndefined();
  });

  it("getPack returns window.pack or undefined", () => {
    expect(getPack()).toBeUndefined();
    (globalThis as Record<string, unknown>).pack = { states: [] };
    expect(getPack()).toEqual({ states: [] });
  });

  it("getPackCollection returns array collections or undefined", () => {
    (globalThis as Record<string, unknown>).pack = {
      burgs: [{ i: 0 }, { i: 1 }],
      notAnArray: "x",
    };
    expect(getPackCollection<{ i: number }>("burgs")).toEqual([
      { i: 0 },
      { i: 1 },
    ]);
    expect(getPackCollection("notAnArray")).toBeUndefined();
    expect(getPackCollection("missing")).toBeUndefined();
  });

  it("getNotes returns window.notes if array, else undefined", () => {
    expect(getNotes()).toBeUndefined();
    (globalThis as Record<string, unknown>).notes = [{ id: "marker1" }];
    expect(getNotes()).toEqual([{ id: "marker1" }]);
    (globalThis as Record<string, unknown>).notes = "not an array";
    expect(getNotes()).toBeUndefined();
  });
});
