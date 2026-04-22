import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMapNameTool } from "./set-map-name";

interface FakeInput {
  value: string;
  dispatched: string[];
  dispatchEvent: (evt: Event) => boolean;
}

function makeFakeInput(): FakeInput {
  const input: FakeInput = {
    value: "",
    dispatched: [],
    dispatchEvent(evt: Event) {
      input.dispatched.push(evt.type);
      return true;
    },
  };
  return input;
}

describe("setMapNameTool", () => {
  let input: FakeInput;
  let originalDocument: unknown;
  let originalEvent: unknown;

  beforeEach(() => {
    originalDocument = (globalThis as { document?: unknown }).document;
    originalEvent = (globalThis as { Event?: unknown }).Event;
    input = makeFakeInput();
    (globalThis as { document: unknown }).document = {
      getElementById: vi.fn((id: string) => (id === "mapName" ? input : null)),
    };
    if (typeof (globalThis as { Event?: unknown }).Event === "undefined") {
      (globalThis as { Event: unknown }).Event = class {
        type: string;
        bubbles: boolean;
        constructor(type: string, init?: { bubbles?: boolean }) {
          this.type = type;
          this.bubbles = !!init?.bubbles;
        }
      };
    }
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDocument;
    (globalThis as { Event?: unknown }).Event = originalEvent;
  });

  it("has the expected name and schema", () => {
    expect(setMapNameTool.name).toBe("set_map_name");
    expect(setMapNameTool.input_schema.required).toContain("name");
  });

  it("sets the input value and dispatches input/change events", async () => {
    const result = await setMapNameTool.execute({ name: "Eldoria" });
    expect(input.value).toBe("Eldoria");
    expect(input.dispatched).toContain("input");
    expect(input.dispatched).toContain("change");
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ ok: true, name: "Eldoria" });
  });

  it("trims surrounding whitespace from the provided name", async () => {
    await setMapNameTool.execute({ name: "  Eldoria  " });
    expect(input.value).toBe("Eldoria");
  });

  it("rejects empty or whitespace-only names", async () => {
    const empty = await setMapNameTool.execute({ name: "" });
    expect(empty.isError).toBe(true);
    const whitespace = await setMapNameTool.execute({ name: "   " });
    expect(whitespace.isError).toBe(true);
    expect(input.value).toBe("");
    expect(input.dispatched).toEqual([]);
  });

  it("reports an error when #mapName is missing", async () => {
    (globalThis as { document: unknown }).document = {
      getElementById: () => null,
    };
    const result = await setMapNameTool.execute({ name: "Eldoria" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("#mapName");
  });
});
