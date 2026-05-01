import { getApiKey, setApiKey } from "./api-key";
import type { ChatController, UiEvent } from "./chat-controller";

export interface ChatWindowElements {
  toggleButton: HTMLButtonElement;
  panel: HTMLDivElement;
  log: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  sendButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
  billableCounter: HTMLSpanElement;
  apiKeyRow: HTMLDivElement;
  apiKeyInput: HTMLInputElement;
  apiKeySave: HTMLButtonElement;
  apiKeyToggle: HTMLButtonElement;
  clickBanner: HTMLDivElement;
  clickBannerText: HTMLSpanElement;
  clickBannerCancel: HTMLButtonElement;
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

  const billableCounter = el("span", {
    className: "ai-chat-billable",
    title:
      "Billable-equivalent input tokens since last clear (cache reads ×0.10, writes ×1.25, fresh ×1.0)",
    textContent: "0",
  });

  const clearButton = el("button", {
    type: "button",
    className: "ai-chat-clear",
    title: "Clear conversation (keeps system prompt + tool cache warm)",
    textContent: "⟲",
  });

  const header = el("div", { className: "ai-chat-header" }, [
    el("span", { className: "ai-chat-title", textContent: "AI Assistant" }),
    billableCounter,
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

  const clickBannerText = el("span", {
    className: "ai-chat-click-banner-text",
  });
  const clickBannerCancel = el("button", {
    type: "button",
    className: "ai-chat-click-banner-cancel",
    textContent: "Cancel",
  });
  const clickBanner = el(
    "div",
    {
      className: "ai-chat-click-banner",
      hidden: true,
    },
    [clickBannerText, clickBannerCancel],
  );

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
    clickBanner,
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
    billableCounter,
    apiKeyRow,
    apiKeyInput,
    apiKeySave,
    apiKeyToggle,
    clickBanner,
    clickBannerText,
    clickBannerCancel,
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

  let activeClickToken: object | null = null;
  let escListener: ((evt: KeyboardEvent) => void) | null = null;
  // Running sum of billable-equivalent input tokens since the last reset.
  // Cleared by the "cleared" UI event.
  let billableTotal = 0;

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
        // Billable-equivalent input tokens at Anthropic's published rates:
        // cache reads at 0.10x, cache writes at 1.25x, fresh at 1.0x.
        billableTotal += cached * 0.1 + written * 1.25 + fresh;
        parts.billableCounter.textContent =
          Math.round(billableTotal).toLocaleString();
        break;
      }
      case "cleared":
        parts.log.replaceChildren();
        billableTotal = 0;
        parts.billableCounter.textContent = "0";
        appendMessage(
          parts.log,
          "tool",
          "Conversation cleared. System prompt + tool cache stay warm.",
        );
        break;
      case "error":
        appendMessage(parts.log, "error", event.message);
        break;
      case "click_request": {
        activeClickToken = event.cancelToken;
        parts.clickBannerText.textContent = event.prompt;
        parts.clickBanner.hidden = false;
        parts.clickBannerCancel.onclick = () => {
          if (activeClickToken) controller.cancelClickRequest(activeClickToken);
        };
        if (escListener) {
          document.removeEventListener("keydown", escListener);
        }
        escListener = (evt: KeyboardEvent) => {
          if (evt.key === "Escape" && activeClickToken) {
            controller.cancelClickRequest(activeClickToken);
          }
        };
        document.addEventListener("keydown", escListener);
        break;
      }
      case "click_request_end":
        if (activeClickToken === event.cancelToken) {
          activeClickToken = null;
          parts.clickBanner.hidden = true;
          parts.clickBannerText.textContent = "";
          parts.clickBannerCancel.onclick = null;
          if (escListener) {
            document.removeEventListener("keydown", escListener);
            escListener = null;
          }
        }
        break;
      default: {
        const _exhaustive: never = event;
        void _exhaustive;
        break;
      }
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
