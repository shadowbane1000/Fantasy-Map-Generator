import { getApiKey, setApiKey } from "./api-key";
import type { ChatController, UiEvent } from "./chat-controller";

export interface ChatWindowElements {
  toggleButton: HTMLButtonElement;
  panel: HTMLDivElement;
  log: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  sendButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
  apiKeyRow: HTMLDivElement;
  apiKeyInput: HTMLInputElement;
  apiKeySave: HTMLButtonElement;
  apiKeyToggle: HTMLButtonElement;
  usageBar: HTMLDivElement;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) {
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function appendMessage(
  log: HTMLDivElement,
  role: "user" | "assistant" | "tool" | "error",
  text: string,
): void {
  const bubble = el("div", { className: `ai-chat-msg ai-chat-msg-${role}` }, [
    text,
  ]);
  log.append(bubble);
  log.scrollTop = log.scrollHeight;
}

function renderToolCall(
  log: HTMLDivElement,
  name: string,
  input: unknown,
): void {
  let inputStr = "";
  try {
    inputStr = JSON.stringify(input);
  } catch {
    inputStr = String(input);
  }
  appendMessage(log, "tool", `→ ${name}(${inputStr})`);
}

function renderToolResult(
  log: HTMLDivElement,
  name: string,
  output: string,
  isError?: boolean,
): void {
  const prefix = isError ? `✗ ${name}` : `✓ ${name}`;
  appendMessage(log, "tool", `${prefix} → ${output}`);
}

export function buildChatWindow(): ChatWindowElements {
  const toggleButton = el("button", {
    id: "ai-chat-toggle",
    type: "button",
    title: "Open AI chat",
    textContent: "AI",
  });

  const clearButton = el("button", {
    type: "button",
    className: "ai-chat-clear",
    title: "Clear conversation (keeps system prompt + tool cache warm)",
    textContent: "⟲",
  });

  const header = el("div", { className: "ai-chat-header" }, [
    el("span", { className: "ai-chat-title", textContent: "AI Assistant" }),
    clearButton,
    el("button", {
      type: "button",
      className: "ai-chat-close",
      title: "Collapse",
      textContent: "–",
      onclick: () => {
        panel.classList.remove("ai-chat-open");
        toggleButton.style.display = "";
      },
    }),
  ]);

  const log = el("div", { id: "ai-chat-log", className: "ai-chat-log" });

  const usageBar = el("div", { className: "ai-chat-usage" });

  const textarea = el("textarea", {
    id: "ai-chat-input",
    className: "ai-chat-input",
    rows: 2,
    placeholder:
      'Ask the AI to do something (e.g., "rename the map to Eldoria")',
  });

  const sendButton = el("button", {
    type: "button",
    className: "ai-chat-send",
    textContent: "Send",
  });

  const inputRow = el("div", { className: "ai-chat-inputrow" }, [
    textarea,
    sendButton,
  ]);

  const apiKeyInput = el("input", {
    type: "password",
    className: "ai-chat-apikey-input",
    placeholder: "sk-ant-…",
    autocomplete: "off",
  });
  const apiKeySave = el("button", {
    type: "button",
    className: "ai-chat-apikey-save",
    textContent: "Save",
  });
  const apiKeyRow = el("div", { className: "ai-chat-apikey-row" }, [
    el("label", { textContent: "Anthropic API key: " }),
    apiKeyInput,
    apiKeySave,
  ]);

  const apiKeyToggle = el("button", {
    type: "button",
    className: "ai-chat-apikey-toggle",
    title: "API key settings",
    textContent: "⚙",
  });
  header.append(apiKeyToggle);

  apiKeyToggle.onclick = () => {
    apiKeyRow.classList.toggle("ai-chat-apikey-visible");
  };

  const panel = el("div", { id: "ai-chat-panel", className: "ai-chat-panel" }, [
    header,
    log,
    usageBar,
    apiKeyRow,
    inputRow,
  ]);

  toggleButton.onclick = () => {
    panel.classList.add("ai-chat-open");
    toggleButton.style.display = "none";
    textarea.focus();
  };

  return {
    toggleButton,
    panel,
    log,
    textarea,
    sendButton,
    clearButton,
    apiKeyRow,
    apiKeyInput,
    apiKeySave,
    apiKeyToggle,
    usageBar,
  };
}

export interface MountOptions {
  controller: ChatController;
  container?: HTMLElement;
}

export function mountChatWindow({
  controller,
  container,
}: MountOptions): ChatWindowElements {
  const parts = buildChatWindow();
  const host = container ?? document.body;
  host.append(parts.toggleButton, parts.panel);

  const existingKey = getApiKey();
  if (existingKey) parts.apiKeyInput.value = existingKey;
  else parts.apiKeyRow.classList.add("ai-chat-apikey-visible");

  parts.apiKeySave.onclick = () => {
    const key = parts.apiKeyInput.value.trim();
    if (!key) {
      appendMessage(parts.log, "error", "API key cannot be empty.");
      return;
    }
    setApiKey(key);
    appendMessage(parts.log, "tool", "API key saved.");
    parts.apiKeyRow.classList.remove("ai-chat-apikey-visible");
  };

  const handleEvent = (event: UiEvent): void => {
    switch (event.type) {
      case "user":
        appendMessage(parts.log, "user", event.text);
        break;
      case "assistant":
        appendMessage(parts.log, "assistant", event.text);
        break;
      case "tool_call":
        renderToolCall(parts.log, event.name, event.input);
        break;
      case "tool_result":
        renderToolResult(parts.log, event.name, event.output, event.isError);
        break;
      case "usage": {
        const u = event.usage;
        const cached = u.cache_read_input_tokens ?? 0;
        const written = u.cache_creation_input_tokens ?? 0;
        const fresh = u.input_tokens;
        const total = cached + written + fresh;
        // Billable-equivalent input tokens, per user-defined formula:
        // (total - cached) * 0.1 + written.
        const billable = Math.round((total - cached) * 0.1 + written);
        parts.usageBar.textContent =
          `in: ${total.toLocaleString()}/${billable.toLocaleString()}` +
          ` out: ${u.output_tokens.toLocaleString()}`;
        break;
      }
      case "cleared":
        parts.log.replaceChildren();
        parts.usageBar.textContent = "";
        appendMessage(
          parts.log,
          "tool",
          "Conversation cleared. System prompt + tool cache stay warm.",
        );
        break;
      case "error":
        appendMessage(parts.log, "error", event.message);
        break;
    }
  };
  controller.on(handleEvent);

  parts.clearButton.onclick = () => {
    controller.reset();
  };

  const submit = async () => {
    const text = parts.textarea.value;
    if (!text.trim()) return;
    if (!getApiKey()) {
      appendMessage(
        parts.log,
        "error",
        "No API key set. Click ⚙ to add your Anthropic API key.",
      );
      parts.apiKeyRow.classList.add("ai-chat-apikey-visible");
      return;
    }
    parts.textarea.value = "";
    parts.sendButton.disabled = true;
    try {
      await controller.send(text);
    } finally {
      parts.sendButton.disabled = false;
      parts.textarea.focus();
    }
  };

  parts.sendButton.onclick = () => {
    void submit();
  };
  parts.textarea.addEventListener("keydown", (evt: KeyboardEvent) => {
    if (evt.key === "Enter" && !evt.shiftKey) {
      evt.preventDefault();
      void submit();
    }
  });

  return parts;
}
