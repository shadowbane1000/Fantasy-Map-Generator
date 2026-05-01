import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createListNamesbasesTool,
  defaultListNamesbasesRuntime,
  type ListNamesbasesRuntime,
  listNamesbasesTool,
  type NamesbaseEntry,
} from "./list-namesbases";

function makeRuntime(bases: unknown[] | null): ListNamesbasesRuntime {
  return { getNameBases: () => bases };
}

interface OkBody {
  ok: true;
  count: number;
  items: NamesbaseEntry[];
}

interface ErrorBody {
  ok: false;
  error: string;
}

function parseOk(content: string): OkBody {
  return JSON.parse(content) as OkBody;
}

function parseError(content: string): ErrorBody {
  return JSON.parse(content) as ErrorBody;
}

describe("list_namesbases — runtime behaviour", () => {
  it("happy path: 3 namesbases (German, Elvish, Empty) returned in order", async () => {
    const tool = createListNamesbasesTool(
      makeRuntime([
        {
          name: "German",
          min: 5,
          max: 12,
          d: "lt",
          m: 0,
          b: "Hans,Klaus,Otto,Karl,Stefan,Werner,Heinz,Walter,Dieter,Helmut",
        },
        {
          name: "Elvish",
          min: 4,
          max: 10,
          d: "",
          m: 0.1,
          b: "Aelar,Berris,Caelynn,Dayereth,Enna",
        },
        {
          name: "Empty",
          min: 3,
          max: 8,
          d: "",
          m: 0,
          b: "",
        },
      ]),
    );
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = parseOk(result.content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(3);
    expect(body.items).toHaveLength(3);

    expect(body.items[0]).toEqual<NamesbaseEntry>({
      index: 0,
      name: "German",
      min: 5,
      max: 12,
      duplicate_chars: "lt",
      multiword_rate: 0,
      name_count: 10,
      sample_names: ["Hans", "Klaus", "Otto", "Karl", "Stefan"],
    });
    expect(body.items[0].sample_names).toHaveLength(5);

    expect(body.items[1]).toEqual<NamesbaseEntry>({
      index: 1,
      name: "Elvish",
      min: 4,
      max: 10,
      duplicate_chars: "",
      multiword_rate: 0.1,
      name_count: 5,
      sample_names: ["Aelar", "Berris", "Caelynn", "Dayereth", "Enna"],
    });

    expect(body.items[2]).toEqual<NamesbaseEntry>({
      index: 2,
      name: "Empty",
      min: 3,
      max: 8,
      duplicate_chars: "",
      multiword_rate: 0,
      name_count: 0,
      sample_names: [],
    });
  });

  it("empty corpus → name_count 0, sample_names []", async () => {
    const tool = createListNamesbasesTool(
      makeRuntime([{ name: "Solo", min: 1, max: 2, d: "", m: 0, b: "" }]),
    );
    const body = parseOk((await tool.execute({})).content);
    expect(body.items[0].name_count).toBe(0);
    expect(body.items[0].sample_names).toEqual([]);
  });

  it("`Foo,,Bar,` → name_count 4, sample_names ['Foo', 'Bar']", async () => {
    const tool = createListNamesbasesTool(
      makeRuntime([
        { name: "Sparse", min: 1, max: 2, d: "", m: 0, b: "Foo,,Bar," },
      ]),
    );
    const body = parseOk((await tool.execute({})).content);
    // Matches legacy editor: "Foo,,Bar,".split(",").length === 4
    expect(body.items[0].name_count).toBe(4);
    expect(body.items[0].sample_names).toEqual(["Foo", "Bar"]);
  });

  it("corpus with > 5 names → sample_names is exactly 5 (in order)", async () => {
    const tool = createListNamesbasesTool(
      makeRuntime([
        {
          name: "Many",
          min: 1,
          max: 2,
          d: "",
          m: 0,
          b: "a,b,c,d,e,f,g,h,i,j,k,l,m,n,o",
        },
      ]),
    );
    const body = parseOk((await tool.execute({})).content);
    expect(body.items[0].name_count).toBe(15);
    expect(body.items[0].sample_names).toEqual(["a", "b", "c", "d", "e"]);
    expect(body.items[0].sample_names).toHaveLength(5);
  });

  it("missing `m` → multiword_rate 0", async () => {
    const tool = createListNamesbasesTool(
      makeRuntime([{ name: "NoM", min: 4, max: 8, d: "", b: "x,y,z" }]),
    );
    const body = parseOk((await tool.execute({})).content);
    expect(body.items[0].multiword_rate).toBe(0);
  });

  it("missing `d` → duplicate_chars ''", async () => {
    const tool = createListNamesbasesTool(
      makeRuntime([{ name: "NoD", min: 4, max: 8, m: 0, b: "x,y,z" }]),
    );
    const body = parseOk((await tool.execute({})).content);
    expect(body.items[0].duplicate_chars).toBe("");
  });

  it("trims whitespace in sample_names and skips entries that are pure whitespace", async () => {
    const tool = createListNamesbasesTool(
      makeRuntime([
        {
          name: "Padded",
          min: 1,
          max: 2,
          d: "",
          m: 0,
          b: "  Alpha  , , Beta ,\tGamma\t,   ",
        },
      ]),
    );
    const body = parseOk((await tool.execute({})).content);
    expect(body.items[0].sample_names).toEqual(["Alpha", "Beta", "Gamma"]);
    // Confirm name_count uses raw split (no whitespace filtering): 5 commas-of-5 entries.
    expect(body.items[0].name_count).toBe(5);
  });

  it("non-finite numeric fields fall back to 0", async () => {
    const tool = createListNamesbasesTool(
      makeRuntime([
        {
          name: "NaNs",
          min: Number.NaN,
          max: Number.POSITIVE_INFINITY,
          d: "",
          m: Number.NEGATIVE_INFINITY,
          b: "x",
        },
      ]),
    );
    const body = parseOk((await tool.execute({})).content);
    expect(body.items[0].min).toBe(0);
    expect(body.items[0].max).toBe(0);
    expect(body.items[0].multiword_rate).toBe(0);
  });

  it("skips null / non-object entries inside the array", async () => {
    const tool = createListNamesbasesTool(
      makeRuntime([
        null,
        "garbage",
        { name: "Real", min: 4, max: 8, d: "", m: 0, b: "x,y" },
      ]),
    );
    const body = parseOk((await tool.execute({})).content);
    expect(body.count).toBe(1);
    expect(body.items).toHaveLength(1);
    // Index reflects the original array slot (index 2 here).
    expect(body.items[0].index).toBe(2);
    expect(body.items[0].name).toBe("Real");
  });

  it("preserves the `index` field == original array position", async () => {
    const tool = createListNamesbasesTool(
      makeRuntime([
        { name: "A", min: 1, max: 2, d: "", m: 0, b: "x" },
        { name: "B", min: 1, max: 2, d: "", m: 0, b: "y" },
        { name: "C", min: 1, max: 2, d: "", m: 0, b: "z" },
      ]),
    );
    const body = parseOk((await tool.execute({})).content);
    expect(body.items.map((i) => i.index)).toEqual([0, 1, 2]);
  });

  it("returns empty items + count 0 when nameBases is empty", async () => {
    const tool = createListNamesbasesTool(makeRuntime([]));
    const body = parseOk((await tool.execute({})).content);
    expect(body.count).toBe(0);
    expect(body.items).toEqual([]);
  });
});

describe("list_namesbases — tool surface", () => {
  it("accepts no-args / {} / null / undefined uniformly", async () => {
    const tool = createListNamesbasesTool(makeRuntime([]));
    for (const input of [undefined, null, {}]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      const body = parseOk(result.content);
      expect(body.ok).toBe(true);
    }
  });

  it("ignores unknown extra input keys", async () => {
    const tool = createListNamesbasesTool(makeRuntime([]));
    const result = await tool.execute({ foo: "bar", limit: 99, offset: 5 });
    expect(result.isError).toBeFalsy();
    expect(parseOk(result.content).ok).toBe(true);
  });

  it("surfaces a structured error when the runtime returns null", async () => {
    const tool = createListNamesbasesTool(makeRuntime(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = parseError(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/namesbases/i);
  });

  it("exposes the expected tool surface", () => {
    expect(listNamesbasesTool.name).toBe("list_namesbases");
    expect(listNamesbasesTool.input_schema).toEqual({
      type: "object",
      properties: {},
    });
    expect(typeof listNamesbasesTool.description).toBe("string");
    expect(listNamesbasesTool.description.length).toBeGreaterThan(0);
  });
});

describe("defaultListNamesbasesRuntime (integration with window.nameBases)", () => {
  const original = (globalThis as { nameBases?: unknown }).nameBases;

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = original;
  });

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
  });

  it("returns null when window.nameBases is undefined", () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    expect(defaultListNamesbasesRuntime.getNameBases()).toBeNull();
  });

  it("returns null when window.nameBases is null", () => {
    (globalThis as { nameBases?: unknown }).nameBases = null;
    expect(defaultListNamesbasesRuntime.getNameBases()).toBeNull();
  });

  it("returns null when window.nameBases is not an array (string)", () => {
    (globalThis as { nameBases?: unknown }).nameBases = "not-an-array";
    expect(defaultListNamesbasesRuntime.getNameBases()).toBeNull();
  });

  it("returns null when window.nameBases is not an array (object)", () => {
    (globalThis as { nameBases?: unknown }).nameBases = { 0: "fake" };
    expect(defaultListNamesbasesRuntime.getNameBases()).toBeNull();
  });

  it("reads through when window.nameBases is a valid array", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "Live", min: 4, max: 8, d: "", m: 0, b: "Foo,Bar" },
    ];
    const result = await listNamesbasesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = parseOk(result.content);
    expect(body.count).toBe(1);
    expect(body.items[0].name).toBe("Live");
    expect(body.items[0].name_count).toBe(2);
  });

  it("listNamesbasesTool.execute surfaces error when nameBases is missing", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await listNamesbasesTool.execute({});
    expect(result.isError).toBe(true);
    const body = parseError(result.content);
    expect(body.error).toMatch(/namesbases/i);
  });
});
