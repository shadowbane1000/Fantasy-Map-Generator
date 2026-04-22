import { describe, expect, it } from "vitest";
import { paginatedListResponse, validatePaging } from "./paging";

describe("validatePaging", () => {
  it("returns defaults for empty input", () => {
    expect(validatePaging({})).toEqual({ limit: 100, offset: 0 });
  });

  it("accepts valid limit and offset", () => {
    expect(validatePaging({ limit: 50, offset: 10 })).toEqual({
      limit: 50,
      offset: 10,
    });
  });

  it("honors options.defaultLimit and maxLimit", () => {
    expect(validatePaging({}, { defaultLimit: 25 })).toEqual({
      limit: 25,
      offset: 0,
    });
    expect(validatePaging({ limit: 51 }, { maxLimit: 50 })).toMatch(/1 and 50/);
  });

  it("rejects non-integer, out-of-range, or wrong-type limit", () => {
    for (const bad of [0, 501, 1.5, "5", true, -1]) {
      const r = validatePaging({ limit: bad });
      expect(typeof r).toBe("string");
    }
  });

  it("rejects negative / non-integer / wrong-type offset", () => {
    for (const bad of [-1, 1.5, "0", true]) {
      const r = validatePaging({ offset: bad });
      expect(typeof r).toBe("string");
    }
  });

  it("treats null/undefined limit/offset as 'use default'", () => {
    expect(validatePaging({ limit: null, offset: undefined })).toEqual({
      limit: 100,
      offset: 0,
    });
  });
});

describe("paginatedListResponse", () => {
  it("slices by offset/limit and returns total + echo", () => {
    const items = [1, 2, 3, 4, 5];
    const r = paginatedListResponse(items, { limit: 2, offset: 1 }, "things", {
      filters: { state: 7 },
    });
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      total: 5,
      limit: 2,
      offset: 1,
      filters: { state: 7 },
      things: [2, 3],
    });
  });

  it("returns an empty slice when offset exceeds length", () => {
    const r = paginatedListResponse([1, 2], { limit: 10, offset: 5 }, "items");
    expect(JSON.parse(r.content).items).toEqual([]);
  });
});
