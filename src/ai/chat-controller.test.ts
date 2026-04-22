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
});
