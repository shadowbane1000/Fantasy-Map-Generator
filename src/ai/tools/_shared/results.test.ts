import { describe, expect, it } from "vitest";
import { errorResult, okResult } from "./results";

describe("okResult", () => {
  it("produces a success result with an empty body by default", () => {
    expect(okResult()).toEqual({ content: JSON.stringify({ ok: true }) });
  });

  it("merges body fields alongside ok: true", () => {
    const r = okResult({ i: 1, name: "X" });
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(r.content)).toEqual({ ok: true, i: 1, name: "X" });
  });
});

describe("errorResult", () => {
  it("produces an error result with isError: true", () => {
    const r = errorResult("something went wrong");
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content)).toEqual({
      ok: false,
      error: "something went wrong",
    });
  });

  it("merges extra fields alongside the error", () => {
    const r = errorResult("Unknown tool", { supported: ["a", "b"] });
    expect(JSON.parse(r.content)).toEqual({
      ok: false,
      error: "Unknown tool",
      supported: ["a", "b"],
    });
  });
});
