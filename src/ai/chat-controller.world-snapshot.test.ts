import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AnthropicClientLike,
  AnthropicContentBlock,
  AnthropicRequest,
  AnthropicResponse,
  AnthropicTextBlock,
} from "./anthropic-client";
import { ChatController } from "./chat-controller";
import { ToolRegistry } from "./tools";
import type { RawNote } from "./tools/_shared";

function scriptedClient(
  responses: AnthropicResponse[],
): AnthropicClientLike & { calls: AnthropicRequest[] } {
  const calls: AnthropicRequest[] = [];
  let i = 0;
  return {
    calls,
    async sendMessage(req: AnthropicRequest) {
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

function getWorldContextText(req: AnthropicRequest): string {
  const sys = req.system as AnthropicTextBlock[];
  expect(Array.isArray(sys)).toBe(true);
  expect(sys.length).toBe(2);
  return sys[1].text;
}

describe("ChatController world-context snapshot", () => {
  let savedNotes: unknown;

  beforeEach(() => {
    savedNotes = (globalThis as { notes?: unknown }).notes;
  });

  afterEach(() => {
    (globalThis as { notes?: unknown }).notes = savedNotes;
  });

  it("captures world:premise legend at construction and emits it on send()", async () => {
    (globalThis as { notes?: unknown }).notes = [
      { id: "world:premise", legend: "It's a swamp." },
    ] satisfies RawNote[];
    const client = scriptedClient([
      makeResponse([{ type: "text", text: "ok" }]),
    ]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });
    await controller.send("hi");

    const text = getWorldContextText(client.calls[0]);
    expect(text).toContain("World premise: It's a swamp.");
    expect(text).toContain("World topics defined: (none yet).");
    expect(text).toContain("get_world_note(topic)");
  });

  it("does NOT refresh the snapshot when notes mutate between sends", async () => {
    (globalThis as { notes?: unknown }).notes = [
      { id: "world:premise", legend: "ORIGINAL legend." },
    ] satisfies RawNote[];
    const client = scriptedClient([
      makeResponse([{ type: "text", text: "ok 1" }]),
      makeResponse([{ type: "text", text: "ok 2" }]),
    ]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });

    await controller.send("a");

    // Mutate AFTER the snapshot was captured.
    const notes = (globalThis as { notes: RawNote[] }).notes;
    notes[0].legend = "MUTATED legend.";
    notes.push({ id: "world:newtopic", legend: "(stuff)" });

    await controller.send("b");

    const text0 = getWorldContextText(client.calls[0]);
    const text1 = getWorldContextText(client.calls[1]);
    expect(text0).toBe(text1);
    expect(text0).toContain("ORIGINAL legend.");
    expect(text0).not.toContain("MUTATED");
    expect(text0).not.toContain("world:newtopic");
  });

  it("refreshes the snapshot on reset() — new notes appear in the next conversation", async () => {
    (globalThis as { notes?: unknown }).notes = [
      { id: "world:premise", legend: "ORIGINAL." },
    ] satisfies RawNote[];
    const client = scriptedClient([
      makeResponse([{ type: "text", text: "ok 1" }]),
      makeResponse([{ type: "text", text: "ok 2" }]),
    ]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });

    await controller.send("a");

    // Mutate, then reset, then send again — the new send() should see
    // the post-mutation snapshot.
    const notes = (globalThis as { notes: RawNote[] }).notes;
    notes[0].legend = "REFRESHED.";
    notes.push({ id: "world:cosmology", legend: "..." });
    controller.reset();

    await controller.send("b");

    const text0 = getWorldContextText(client.calls[0]);
    const text1 = getWorldContextText(client.calls[1]);
    expect(text0).toContain("ORIGINAL.");
    expect(text0).not.toContain("world:cosmology");
    expect(text1).toContain("REFRESHED.");
    expect(text1).toContain("world:cosmology");
  });

  it("reset() before any send() still recaptures the snapshot", async () => {
    (globalThis as { notes?: unknown }).notes = [];
    const client = scriptedClient([
      makeResponse([{ type: "text", text: "ok" }]),
    ]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });

    // Initial snapshot was empty. Mutate notes BEFORE the first send.
    (globalThis as { notes?: unknown }).notes = [
      { id: "world:premise", legend: "After-reset legend." },
    ] satisfies RawNote[];
    controller.reset();

    await controller.send("a");
    const text = getWorldContextText(client.calls[0]);
    expect(text).toContain("After-reset legend.");
  });

  it("caps long world:premise legend at 4000 chars + truncation marker", async () => {
    const long = "x".repeat(5000);
    (globalThis as { notes?: unknown }).notes = [
      { id: "world:premise", legend: long },
    ] satisfies RawNote[];
    const client = scriptedClient([
      makeResponse([{ type: "text", text: "ok" }]),
    ]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });
    await controller.send("hi");

    const text = getWorldContextText(client.calls[0]);
    expect(text).toContain(`${"x".repeat(4000)}\n…(truncated)`);
    // And NOT the full 5000-char string.
    expect(text).not.toContain("x".repeat(4001));
  });

  it("emits placeholders when window.notes is undefined", async () => {
    (globalThis as { notes?: unknown }).notes = undefined;
    const client = scriptedClient([
      makeResponse([{ type: "text", text: "ok" }]),
    ]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });
    await controller.send("hi");

    const text = getWorldContextText(client.calls[0]);
    expect(text).toContain("World premise: (not yet defined)");
    expect(text).toContain("World topics defined: (none yet).");
  });

  it("emits placeholders when window.notes is empty", async () => {
    (globalThis as { notes?: unknown }).notes = [];
    const client = scriptedClient([
      makeResponse([{ type: "text", text: "ok" }]),
    ]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });
    await controller.send("hi");

    const text = getWorldContextText(client.calls[0]);
    expect(text).toContain("World premise: (not yet defined)");
    expect(text).toContain("World topics defined: (none yet).");
  });

  it("emits placeholders when notes contain no world:* ids", async () => {
    (globalThis as { notes?: unknown }).notes = [
      { id: "marker1", legend: "Some marker note." },
      { id: "burg2", legend: "Some burg note." },
    ] satisfies RawNote[];
    const client = scriptedClient([
      makeResponse([{ type: "text", text: "ok" }]),
    ]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });
    await controller.send("hi");

    const text = getWorldContextText(client.calls[0]);
    expect(text).toContain("World premise: (not yet defined)");
    expect(text).toContain("World topics defined: (none yet).");
  });

  it("treats an empty world:premise legend as missing", async () => {
    (globalThis as { notes?: unknown }).notes = [
      { id: "world:premise", legend: "" },
    ] satisfies RawNote[];
    const client = scriptedClient([
      makeResponse([{ type: "text", text: "ok" }]),
    ]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });
    await controller.send("hi");

    const text = getWorldContextText(client.calls[0]);
    expect(text).toContain("World premise: (not yet defined)");
  });

  it("excludes world:premise from topic list, preserves first-seen order, deduplicates", async () => {
    (globalThis as { notes?: unknown }).notes = [
      { id: "world:premise", legend: "A premise." },
      { id: "world:cosmology", legend: "..." },
      { id: "marker1", legend: "..." },
      { id: "world:religion", legend: "..." },
      // Duplicate id — should not appear twice.
      { id: "world:cosmology", legend: "..." },
    ] satisfies RawNote[];
    const client = scriptedClient([
      makeResponse([{ type: "text", text: "ok" }]),
    ]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });
    await controller.send("hi");

    const text = getWorldContextText(client.calls[0]);
    expect(text).toContain(
      "World topics defined: world:cosmology, world:religion.",
    );
    // marker1 is not a world:* id — should not appear.
    expect(text).not.toContain("marker1");
  });

  it("places cache_control breakpoints on both system blocks AND on the conversation tail", async () => {
    (globalThis as { notes?: unknown }).notes = [
      { id: "world:premise", legend: "Cached." },
    ] satisfies RawNote[];
    const client = scriptedClient([
      makeResponse([{ type: "text", text: "ok" }]),
    ]);
    const controller = new ChatController({
      client,
      registry: new ToolRegistry(),
    });
    await controller.send("hi");

    const sys = client.calls[0].system as AnthropicTextBlock[];
    expect(sys).toHaveLength(2);
    expect(sys[0].cache_control).toEqual({ type: "ephemeral" });
    expect(sys[1].cache_control).toEqual({ type: "ephemeral" });

    // Conversation tail: the existing breakpoint (last block of the
    // last message) is still present.
    const lastMsg = client.calls[0].messages.at(-1);
    const blocks = lastMsg?.content as AnthropicContentBlock[];
    const tail = blocks.at(-1) as AnthropicContentBlock & {
      cache_control?: { type: string };
    };
    expect(tail.cache_control).toEqual({ type: "ephemeral" });
  });
});
