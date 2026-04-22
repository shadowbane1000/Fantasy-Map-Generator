import { describe, expect, it } from "vitest";
import { type Tool, ToolRegistry } from "./index";

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: "noop",
    description: "",
    input_schema: { type: "object", properties: {} },
    execute: () => ({ content: "ok" }),
    ...overrides,
  };
}

describe("ToolRegistry", () => {
  it("registers and lists tools", () => {
    const reg = new ToolRegistry();
    reg.register(makeTool({ name: "a" }));
    reg.register(makeTool({ name: "b" }));
    expect(reg.list().map((t) => t.name)).toEqual(["a", "b"]);
  });

  it("exposes Anthropic-formatted schemas", () => {
    const reg = new ToolRegistry();
    reg.register(
      makeTool({
        name: "set_foo",
        description: "sets foo",
        input_schema: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
        },
      }),
    );
    expect(reg.toAnthropicSchemas()).toEqual([
      {
        name: "set_foo",
        description: "sets foo",
        input_schema: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
        },
      },
    ]);
  });

  it("runs a registered tool and returns its result", async () => {
    const reg = new ToolRegistry();
    reg.register(
      makeTool({
        name: "echo",
        execute: (input: unknown) => ({
          content: JSON.stringify({ got: input }),
        }),
      }),
    );
    const result = await reg.run("echo", { a: 1 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ got: { a: 1 } });
  });

  it("returns an error result for an unknown tool", async () => {
    const reg = new ToolRegistry();
    const result = await reg.run("nope", {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Unknown tool");
  });

  it("captures executor exceptions as error results", async () => {
    const reg = new ToolRegistry();
    reg.register(
      makeTool({
        name: "boom",
        execute: () => {
          throw new Error("kaboom");
        },
      }),
    );
    const result = await reg.run("boom", {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("kaboom");
  });

  it("awaits async executors", async () => {
    const reg = new ToolRegistry();
    reg.register(
      makeTool({
        name: "slow",
        execute: async () => {
          await Promise.resolve();
          return { content: "done" };
        },
      }),
    );
    const result = await reg.run("slow", {});
    expect(result.content).toBe("done");
  });
});
