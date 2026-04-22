import { describe, expect, it } from "vitest";
import { createAliasResolver } from "./alias-resolver";

describe("createAliasResolver", () => {
  const resolve = createAliasResolver(
    ["roads", "trails", "searoutes"] as const,
    {
      road: "roads",
      trail: "trails",
      "sea lanes": "searoutes",
    },
  );

  it("resolves canonical values case-insensitively", () => {
    expect(resolve("roads")).toBe("roads");
    expect(resolve("ROADS")).toBe("roads");
    expect(resolve("  Trails  ")).toBe("trails");
  });

  it("resolves aliases", () => {
    expect(resolve("road")).toBe("roads");
    expect(resolve("trail")).toBe("trails");
    expect(resolve("SEA LANES")).toBe("searoutes");
  });

  it("returns null for unknown / invalid input", () => {
    expect(resolve("highway")).toBeNull();
    expect(resolve("")).toBeNull();
    expect(resolve("   ")).toBeNull();
    expect(resolve(42)).toBeNull();
    expect(resolve(null)).toBeNull();
    expect(resolve(undefined)).toBeNull();
  });

  it("works with an empty alias map", () => {
    const r = createAliasResolver(["a", "b"] as const);
    expect(r("A")).toBe("a");
    expect(r("c")).toBeNull();
  });

  it("trims alias keys too", () => {
    const r = createAliasResolver(["foo"] as const, { "  bar  ": "foo" });
    expect(r("bar")).toBe("foo");
  });
});
