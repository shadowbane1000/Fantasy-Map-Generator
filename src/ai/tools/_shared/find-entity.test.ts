import { describe, expect, it } from "vitest";
import { findEntityByRef, isActive } from "./find-entity";

describe("isActive", () => {
  it("returns true for present, non-removed, non-zero entries", () => {
    expect(isActive({ i: 1 })).toBe(true);
    expect(isActive({ i: 5, removed: false })).toBe(true);
  });
  it("returns false for null, i=0, or removed", () => {
    expect(isActive(null)).toBe(false);
    expect(isActive(undefined)).toBe(false);
    expect(isActive({ i: 0 })).toBe(false);
    expect(isActive({ i: 1, removed: true })).toBe(false);
  });
});

describe("findEntityByRef", () => {
  const entries = [
    { i: 0, name: "Placeholder" },
    { i: 1, name: "Altaria", fullName: "Kingdom of Altaria" },
    { i: 2, name: "Borgnia" },
    { i: 3, name: "Gone", removed: true },
  ];

  it("resolves by numeric id", () => {
    expect(findEntityByRef(entries, 1)?.name).toBe("Altaria");
  });

  it("resolves by case-insensitive name", () => {
    expect(findEntityByRef(entries, "BORGNIA")?.i).toBe(2);
  });

  it("resolves by case-insensitive fullName", () => {
    expect(findEntityByRef(entries, "kingdom of altaria")?.i).toBe(1);
  });

  it("rejects id 0, unknown ids, and removed entries", () => {
    expect(findEntityByRef(entries, 0)).toBeNull();
    expect(findEntityByRef(entries, 99)).toBeNull();
    expect(findEntityByRef(entries, 3)).toBeNull();
  });

  it("rejects non-integer ids, empty strings, and unknown names", () => {
    expect(findEntityByRef(entries, 1.5)).toBeNull();
    expect(findEntityByRef(entries, "")).toBeNull();
    expect(findEntityByRef(entries, "   ")).toBeNull();
    expect(findEntityByRef(entries, "nowhere")).toBeNull();
  });

  it("returns null when entries is undefined", () => {
    expect(findEntityByRef(undefined, 1)).toBeNull();
  });

  it("rejects non-string/non-number refs", () => {
    expect(findEntityByRef(entries, true as unknown as number)).toBeNull();
    expect(findEntityByRef(entries, {} as unknown as number)).toBeNull();
  });
});
