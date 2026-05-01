import { describe, expect, it, vi } from "vitest";
import type {
  AnthropicClientLike,
  AnthropicContentBlock,
  AnthropicRequest,
  AnthropicResponse,
} from "./anthropic-client";
import { ChatController, type UiEvent } from "./chat-controller";
import { ToolRegistry } from "./tools";

function scriptedClient(
  responses: AnthropicResponse[],
): AnthropicClientLike & { calls: AnthropicRequest[] } {
  const calls: AnthropicRequest[] = [];
  let i = 0;
  return {
    calls,
    async sendMessage(req: AnthropicRequest) {
      // Snapshot so later mutations of the history array don't leak in.
      calls.push(JSON.parse(JSON.stringify(req)) as AnthropicRequest);
      const next = responses[i++];
      if (!next) throw new Error("No more scripted responses");
      return next;
    },
  };
}

function makeResponse(
  content: AnthropicContentBlock[],
  stop_reason: AnthropicResponse["stop_reason"] = "end_turn",
): AnthropicResponse {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "test",
    content,
    stop_reason,
    stop_sequence: null,
  };
}

describe("ChatController", () => {
  it("runs a tool when the model requests one and loops until stop", async () => {
    const reg = new ToolRegistry();
    const exec = vi.fn(() => ({ content: JSON.stringify({ ok: true }) }));
    reg.register({
      name: "set_map_name",
      description: "",
      input_schema: { type: "object", properties: {} },
      execute: exec,
    });

    const client = scriptedClient([
      makeResponse(
        [
          { type: "text", text: "Renaming now." },
          {
            type: "tool_use",
            id: "toolu_1",
            name: "set_map_name",
            input: { name: "Eldoria" },
          },
        ],
        "tool_use",
      ),
      makeResponse([{ type: "text", text: "Done — renamed to Eldoria." }]),
    ]);

    const events: UiEvent[] = [];
    const controller = new ChatController({ client, registry: reg });
    controller.on((e) => events.push(e));
    await controller.send("rename to Eldoria");

    expect(exec).toHaveBeenCalledOnce();
    expect(exec).toHaveBeenCalledWith({ name: "Eldoria" });

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      "user",
      "assistant",
      "tool_call",
      "tool_result",
      "assistant",
    ]);
    const finalAssistant = events.at(-1);
    expect(finalAssistant).toMatchObject({
      type: "assistant",
      text: expect.stringContaining("Eldoria"),
    });
    expect(client.calls).toHaveLength(2);
    // Second call should include the tool_result message in history.
    const lastMsg = client.calls[1].messages.at(-1);
    expect(lastMsg?.role).toBe("user");
    expect(Array.isArray(lastMsg?.content)).toBe(true);
    const resultBlock = (lastMsg?.content as AnthropicContentBlock[])[0];
    expect(resultBlock.type).toBe("tool_result");
  });

  it("emits an error when the API throws", async () => {
    const client: AnthropicClientLike = {
      async sendMessage() {
        throw new Error("401 unauthorized");
      },
    };
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });
    const events: UiEvent[] = [];
    controller.on((e) => events.push(e));
    await controller.send("hello");
    expect(events.at(-1)).toEqual({
      type: "error",
      message: "401 unauthorized",
    });
  });

  it("stops after maxToolIterations to prevent runaway loops", async () => {
    const reg = new ToolRegistry();
    reg.register({
      name: "forever",
      description: "",
      input_schema: { type: "object", properties: {} },
      execute: () => ({ content: "{}" }),
    });

    let call = 0;
    const client: AnthropicClientLike = {
      async sendMessage() {
        call++;
        return makeResponse(
          [
            {
              type: "tool_use",
              id: `toolu_${call}`,
              name: "forever",
              input: {},
            },
          ],
          "tool_use",
        );
      },
    };

    const controller = new ChatController({
      client,
      registry: reg,
      maxToolIterations: 3,
    });
    const events: UiEvent[] = [];
    controller.on((e) => events.push(e));
    await controller.send("go");

    expect(call).toBe(3);
    expect(events.at(-1)?.type).toBe("error");
  });

  it("ignores empty user input", async () => {
    const client = scriptedClient([]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });
    await controller.send("   ");
    expect(client.calls).toHaveLength(0);
  });

  it("attaches a cache_control breakpoint to the system prompt", async () => {
    const client = scriptedClient([
      makeResponse([{ type: "text", text: "ok" }]),
    ]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
      systemPrompt: "you are a test bot",
    });
    await controller.send("hi");

    const sys = client.calls[0].system;
    // System must be array form so cache_control can hang off the text block.
    expect(Array.isArray(sys)).toBe(true);
    const sysArr = sys as {
      type: string;
      text: string;
      cache_control?: unknown;
    }[];
    expect(sysArr).toHaveLength(1);
    expect(sysArr[0]).toMatchObject({
      type: "text",
      text: "you are a test bot",
      cache_control: { type: "ephemeral" },
    });
  });

  it("attaches a cache_control breakpoint to the last block of the conversation tail", async () => {
    const client = scriptedClient([
      makeResponse([{ type: "text", text: "ok" }]),
    ]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });
    await controller.send("hello");

    const lastMsg = client.calls[0].messages.at(-1);
    expect(lastMsg?.role).toBe("user");
    // String content gets normalised to a single text block so the marker
    // can attach. The last (only) block carries cache_control.
    const blocks = lastMsg?.content as AnthropicContentBlock[];
    expect(Array.isArray(blocks)).toBe(true);
    const tail = blocks.at(-1) as AnthropicContentBlock & {
      cache_control?: { type: string };
    };
    expect(tail.cache_control).toEqual({ type: "ephemeral" });
  });

  it("moves the tail breakpoint forward each tool-use iteration", async () => {
    const reg = new ToolRegistry();
    reg.register({
      name: "noop",
      description: "",
      input_schema: { type: "object", properties: {} },
      execute: () => ({ content: "{}" }),
    });
    const client = scriptedClient([
      makeResponse(
        [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "noop",
            input: {},
          },
        ],
        "tool_use",
      ),
      makeResponse([{ type: "text", text: "done" }]),
    ]);
    const controller = new ChatController({ client, registry: reg });
    await controller.send("go");

    // First call: tail breakpoint on the user message block.
    const firstBlocks = client.calls[0].messages.at(-1)
      ?.content as AnthropicContentBlock[];
    expect(
      (firstBlocks.at(-1) as { cache_control?: unknown }).cache_control,
    ).toEqual({ type: "ephemeral" });

    // Second call: tool_results have been appended; the marker now sits on
    // the last tool_result block, NOT on the original user message.
    const secondBlocks = client.calls[1].messages.at(-1)
      ?.content as AnthropicContentBlock[];
    expect(secondBlocks.at(-1)?.type).toBe("tool_result");
    expect(
      (secondBlocks.at(-1) as { cache_control?: unknown }).cache_control,
    ).toEqual({ type: "ephemeral" });

    // And the older user message in the same request is NOT marked — only
    // the most-recent tail carries the breakpoint.
    const earlier = client.calls[1].messages[0].content as unknown as
      | AnthropicContentBlock[]
      | string;
    if (typeof earlier !== "string") {
      for (const b of earlier) {
        expect(
          (b as { cache_control?: unknown }).cache_control,
        ).toBeUndefined();
      }
    }
  });

  it("emits a 'usage' event with cache hit/write counts when the API returns them", async () => {
    const responseWithUsage: AnthropicResponse = {
      ...makeResponse([{ type: "text", text: "ok" }]),
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 30000,
      },
    };
    const client = scriptedClient([responseWithUsage]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });
    const events: UiEvent[] = [];
    controller.on((e) => events.push(e));
    await controller.send("hi");

    const usage = events.find((e) => e.type === "usage");
    expect(usage).toMatchObject({
      type: "usage",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 30000,
      },
    });
  });

  it("reset() clears history and emits a 'cleared' event", async () => {
    const client = scriptedClient([
      makeResponse([{ type: "text", text: "ok" }]),
    ]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });
    const events: UiEvent[] = [];
    controller.on((e) => events.push(e));
    await controller.send("hi");
    expect(controller.getHistory().length).toBeGreaterThan(0);

    controller.reset();
    expect(controller.getHistory()).toEqual([]);
    expect(events.at(-1)).toEqual({ type: "cleared" });
  });
});
