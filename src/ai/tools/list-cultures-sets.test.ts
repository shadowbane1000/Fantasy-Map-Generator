import { describe, expect, it } from "vitest";
import {
  type CulturesSetEntry,
  createListCulturesSetsTool,
  cultureSetDisplayName,
  listCulturesSetsEntries,
  listCulturesSetsTool,
} from "./list-cultures-sets";
import { CULTURES_SETS } from "./set-cultures-set";

describe("list_cultures_sets tool", () => {
  it("returns all 8 sets in tuple order", async () => {
    const tool = createListCulturesSetsTool();
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(CULTURES_SETS.length);
    expect(body.sets).toHaveLength(CULTURES_SETS.length);
    expect(body.sets.map((s: CulturesSetEntry) => s.id)).toEqual([
      ...CULTURES_SETS,
    ]);
  });

  it("emits human-friendly names for compound ids", async () => {
    const tool = createListCulturesSetsTool();
    const body = JSON.parse((await tool.execute({})).content);
    const byId = new Map<string, string>(
      body.sets.map((s: CulturesSetEntry) => [s.id, s.name] as const),
    );
    expect(byId.get("highFantasy")).toBe("High Fantasy");
    expect(byId.get("darkFantasy")).toBe("Dark Fantasy");
    expect(byId.get("world")).toBe("World");
    expect(byId.get("european")).toBe("European");
    expect(byId.get("oriental")).toBe("Oriental");
    expect(byId.get("english")).toBe("English");
    expect(byId.get("antique")).toBe("Antique");
    expect(byId.get("random")).toBe("Random");
  });

  it("every entry has a non-empty string id and name", async () => {
    const tool = createListCulturesSetsTool();
    const body = JSON.parse((await tool.execute({})).content);
    for (const entry of body.sets as CulturesSetEntry[]) {
      expect(typeof entry.id).toBe("string");
      expect(entry.id.length).toBeGreaterThan(0);
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });

  it("tolerates no-input, empty object, and unknown keys", async () => {
    const tool = createListCulturesSetsTool();
    const ref = JSON.parse((await tool.execute({})).content);
    for (const input of [
      undefined,
      null,
      {},
      { ignored: true },
      { sets: "no" },
    ]) {
      const body = JSON.parse((await tool.execute(input)).content);
      expect(body).toEqual(ref);
    }
  });
});

describe("listCulturesSetsEntries", () => {
  it("length equals CULTURES_SETS length", () => {
    expect(listCulturesSetsEntries()).toHaveLength(CULTURES_SETS.length);
  });

  it("order matches CULTURES_SETS positional order", () => {
    const entries = listCulturesSetsEntries();
    for (let i = 0; i < CULTURES_SETS.length; i++) {
      expect(entries[i].id).toBe(CULTURES_SETS[i]);
    }
  });
});

describe("cultureSetDisplayName", () => {
  it("splits highFantasy and darkFantasy into two words", () => {
    expect(cultureSetDisplayName("highFantasy")).toBe("High Fantasy");
    expect(cultureSetDisplayName("darkFantasy")).toBe("Dark Fantasy");
  });

  it("title-cases simple ids", () => {
    expect(cultureSetDisplayName("world")).toBe("World");
    expect(cultureSetDisplayName("european")).toBe("European");
    expect(cultureSetDisplayName("oriental")).toBe("Oriental");
    expect(cultureSetDisplayName("english")).toBe("English");
    expect(cultureSetDisplayName("antique")).toBe("Antique");
    expect(cultureSetDisplayName("random")).toBe("Random");
  });
});

describe("listCulturesSetsTool (default export / integration)", () => {
  it("executes through the exported default instance", async () => {
    const result = await (
      listCulturesSetsTool as unknown as {
        execute: (input: unknown) => Promise<import("./index").ToolResult>;
      }
    ).execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(8);
    expect(body.sets).toHaveLength(8);
    expect(body.sets.map((s: CulturesSetEntry) => s.id)).toEqual([
      ...CULTURES_SETS,
    ]);
  });
});
