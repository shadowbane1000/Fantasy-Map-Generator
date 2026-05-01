import { describe, expect, it, vi } from "vitest";
import type { AnthropicClientLike, AnthropicRequest } from "./anthropic-client";
import {
  ChatController,
  type ClickTarget,
  type UiEvent,
} from "./chat-controller";
import { ToolRegistry } from "./tools";

function nullClient(): AnthropicClientLike {
  return {
    async sendMessage(_req: AnthropicRequest) {
      throw new Error("not used");
    },
  };
}

function makeController() {
  const events: UiEvent[] = [];
  const controller = new ChatController({
    client: nullClient(),
    registry: new ToolRegistry(),
  });
  controller.on((e) => events.push(e));
  return { controller, events };
}

describe("ChatController click-request glue", () => {
  it("emitClickRequest reaches listeners with the right shape", () => {
    const { controller, events } = makeController();
    const token = {};
    const target: ClickTarget = "burg";
    controller.emitClickRequest({
      prompt: "Pick one",
      target,
      cancelToken: token,
    });
    expect(events).toEqual([
      {
        type: "click_request",
        prompt: "Pick one",
        target: "burg",
        cancelToken: token,
      },
    ]);
  });

  it("emitClickRequestEnd reaches listeners", () => {
    const { controller, events } = makeController();
    const token = {};
    controller.emitClickRequestEnd(token);
    expect(events).toEqual([{ type: "click_request_end", cancelToken: token }]);
  });

  it("registerClickCancel + cancelClickRequest round-trip per token", () => {
    const { controller } = makeController();
    const tokenA = {};
    const tokenB = {};
    const cbA = vi.fn();
    const cbB = vi.fn();
    controller.registerClickCancel(tokenA, cbA);
    controller.registerClickCancel(tokenB, cbB);
    controller.cancelClickRequest(tokenA);
    expect(cbA).toHaveBeenCalledOnce();
    expect(cbB).not.toHaveBeenCalled();
    controller.cancelClickRequest(tokenB);
    expect(cbB).toHaveBeenCalledOnce();
  });

  it("registerClickCancel returns an unsubscribe function", () => {
    const { controller } = makeController();
    const token = {};
    const cb = vi.fn();
    const unsub = controller.registerClickCancel(token, cb);
    unsub();
    controller.cancelClickRequest(token);
    expect(cb).not.toHaveBeenCalled();
  });

  it("multiple callbacks per token all fire on cancel", () => {
    const { controller } = makeController();
    const token = {};
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    controller.registerClickCancel(token, cb1);
    controller.registerClickCancel(token, cb2);
    controller.cancelClickRequest(token);
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });

  it("a throwing cancel callback does not poison its sibling", () => {
    const { controller } = makeController();
    const token = {};
    const cb1 = vi.fn(() => {
      throw new Error("boom");
    });
    const cb2 = vi.fn();
    controller.registerClickCancel(token, cb1);
    controller.registerClickCancel(token, cb2);
    expect(() => controller.cancelClickRequest(token)).not.toThrow();
    expect(cb2).toHaveBeenCalledOnce();
  });

  it("cancelClickRequest with an unknown token is a no-op", () => {
    const { controller } = makeController();
    expect(() => controller.cancelClickRequest({})).not.toThrow();
  });
});
