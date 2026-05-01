// World Editor — list-style editor for world:* notes.
// Plan 372 (Layer 3 of the world-building feature). Predefined topics
// — premise, cosmology, pantheon, magic, calendar, history — are
// always shown. User-defined world:* topics are shown when they exist.
// Editing or deleting `world:premise` clears the AI chat (with
// confirmation) because plan 371 snapshots the premise on chat start.

const WORLD_TOPICS = ["premise", "cosmology", "pantheon", "magic", "calendar", "history"];
const TOPIC_REGEX = /^[a-z][a-z0-9_-]{0,31}$/;
const PREVIEW_LEN = 80;

const $body = insertEditorHtml();
addListeners();

export function open() {
  closeDialogs("#worldEditor, .stable");
  refreshWorldEditor();

  $("#worldEditor").dialog({
    title: "World",
    resizable: false,
    width: "auto",
    position: {my: "right top", at: "right-10 top+10", of: "svg"}
  });
}

function insertEditorHtml() {
  const editorHtml = /* html */ `<div id="worldEditor" class="dialog stable">
    <div id="worldHeader" class="header" style="grid-template-columns: 8em 12em 24em 5em">
      <div data-tip="World note id">Topic&nbsp;</div>
      <div data-tip="Display name">Name&nbsp;</div>
      <div data-tip="Legend preview">Legend&nbsp;</div>
      <div data-tip="Per-row actions">Actions&nbsp;</div>
    </div>

    <div id="worldEditorBody" class="table" data-type="absolute"></div>

    <div id="worldFooter" class="totalLine">
      <div data-tip="Number of populated world topics" style="margin-left: 12px">
        Populated:&nbsp;<span id="worldFooterPopulated">0</span>
      </div>
      <div data-tip="Total world topics shown" style="margin-left: 12px">
        Total:&nbsp;<span id="worldFooterTotal">0</span>
      </div>
    </div>

    <div id="worldBottom">
      <button id="worldEditorRefresh" data-tip="Refresh the Editor" class="icon-cw"></button>
      <button id="worldAdd" data-tip="Add a new world topic" class="icon-plus"></button>
    </div>
  </div>`;

  byId("dialogs").insertAdjacentHTML("beforeend", editorHtml);
  return byId("worldEditorBody");
}

function addListeners() {
  byId("worldEditorRefresh").on("click", refreshWorldEditor);
  byId("worldAdd").on("click", addWorldTopic);
}

function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function defaultName(topic) {
  return `World — ${capitalize(topic)}`;
}

function getWorldNote(topic) {
  if (!Array.isArray(window.notes)) return null;
  return window.notes.find(n => n.id === `world:${topic}`) || null;
}

function listUserTopics() {
  if (!Array.isArray(window.notes)) return [];
  const predefined = new Set(WORLD_TOPICS);
  const out = [];
  for (const note of window.notes) {
    if (typeof note?.id !== "string") continue;
    if (!note.id.startsWith("world:")) continue;
    const topic = note.id.slice("world:".length);
    if (predefined.has(topic)) continue;
    out.push(topic);
  }
  out.sort();
  return out;
}

function plainPreview(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = String(html);
  const text = (tmp.textContent || "").replace(/\s+/g, " ").trim();
  if (text.length <= PREVIEW_LEN) return text;
  return text.slice(0, PREVIEW_LEN - 1) + "…";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function refreshWorldEditor() {
  const userTopics = listUserTopics();
  const allTopics = [...WORLD_TOPICS, ...userTopics];

  let lines = "";
  let populated = 0;

  for (const topic of allTopics) {
    const note = getWorldNote(topic);
    const isEmpty = !note;
    const name = note?.name || defaultName(topic);
    const legend = note?.legend || "";
    const preview = isEmpty ? "(empty)" : plainPreview(legend) || "(empty)";
    const id = `world:${topic}`;
    if (!isEmpty) populated += 1;

    const trashClass = isEmpty ? "icon-trash-empty placeholder" : "icon-trash-empty";
    const trashTip = isEmpty ? "No note to delete yet" : "Remove this world note";

    lines += /* html */ `<div
        class="states"
        data-id="${escapeHtml(id)}"
        data-topic="${escapeHtml(topic)}"
        data-empty="${isEmpty ? "true" : "false"}"
      >
        <div class="worldTopic" style="width: 8em">${escapeHtml(topic)}</div>
        <div class="worldName" style="width: 12em" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
        <div class="worldPreview ${isEmpty ? "italic" : ""}" style="width: 24em" title="${escapeHtml(preview)}">${escapeHtml(preview)}</div>
        <div class="worldActions" style="width: 5em">
          <span data-tip="Edit notes" class="icon-edit"></span>
          <span data-tip="${escapeHtml(trashTip)}" class="${trashClass}"></span>
        </div>
      </div>`;
  }

  $body.innerHTML = lines;

  byId("worldFooterPopulated").innerHTML = String(populated);
  byId("worldFooterTotal").innerHTML = String(allTopics.length);

  $body.querySelectorAll(":scope > div").forEach($line => {
    const $edit = $line.querySelector("span.icon-edit");
    if ($edit) $edit.on("click", onEditClick);
    const $trash = $line.querySelector("span.icon-trash-empty:not(.placeholder)");
    if ($trash) $trash.on("click", onTrashClick);
  });
}

function onEditClick() {
  const $row = this.closest("div[data-topic]");
  if (!$row) return;
  const topic = $row.dataset.topic;
  openWorldNoteEditor(topic);
}

function onTrashClick() {
  const $row = this.closest("div[data-topic]");
  if (!$row) return;
  const topic = $row.dataset.topic;
  const id = `world:${topic}`;

  const performDelete = () => {
    const idx = window.notes.findIndex(n => n.id === id);
    if (idx >= 0) window.notes.splice(idx, 1);
    refreshWorldEditor();
  };

  confirmationDialog({
    title: "Remove world note",
    message: `Are you sure you want to remove <b>${escapeHtml(id)}</b>? <br>This action cannot be reverted.`,
    confirm: "Remove",
    onConfirm: () => {
      if (topic === "premise") {
        // The trash path also has to offer to clear the chat — the
        // controller may have a stale snapshot of the about-to-be-deleted
        // premise.
        maybeClearChat(() => performDelete());
      } else {
        performDelete();
      }
    }
  });
}

function addWorldTopic() {
  const raw = window.prompt("Topic id (lowercase letters, digits, _ or -; max 32 chars):", "");
  if (raw === null) return;
  const sanitized = String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
  if (!TOPIC_REGEX.test(sanitized)) {
    return tip("Invalid topic id. Use lowercase letters, digits, _ or -; must start with a letter.", false, "error", 5000);
  }
  const id = `world:${sanitized}`;
  if (Array.isArray(window.notes) && window.notes.some(n => n.id === id)) {
    return tip(`Topic '${sanitized}' already exists.`, false, "error", 4000);
  }
  if (!Array.isArray(window.notes)) window.notes = [];
  const note = {id, name: defaultName(sanitized), legend: ""};
  window.notes.push(note);
  refreshWorldEditor();
  // Open the editor on the freshly-created note.
  openWorldNoteEditor(sanitized);
}

function openWorldNoteEditor(topic) {
  const id = `world:${topic}`;

  // Ensure a note exists so editNotes opens cleanly with the expected
  // display name.
  let note = getWorldNote(topic);
  if (!note) {
    if (!Array.isArray(window.notes)) window.notes = [];
    note = {id, name: defaultName(topic), legend: ""};
    window.notes.push(note);
  }

  const isPremise = topic === "premise";
  const legendBefore = isPremise ? note.legend ?? "" : null;

  // Hook the dialog close event once. When the notes editor closes:
  //  - refresh the world editor body (legend preview may have changed).
  //  - if this was world:premise and the legend changed, prompt the
  //    user to clear the AI chat (which has snapshotted the previous
  //    premise on conversation start).
  $("#notesEditor").one("dialogclose", () => {
    const after = getWorldNote(topic);
    refreshWorldEditor();
    if (!isPremise) return;
    const legendAfter = after?.legend ?? "";
    if (legendAfter === legendBefore) return;
    maybeClearChat(null);
  });

  editNotes(id, note.name);
}

// If the chat history has any messages, prompt the user to reset the
// chat (because the world:premise snapshot taken at chat start is now
// stale). On confirm, calls `controller.reset()` and then the optional
// `afterAction` callback. If chat is empty or the controller is
// missing, runs `afterAction` immediately.
function maybeClearChat(afterAction) {
  const controller = globalThis.__aiChatController;
  let history = [];
  try {
    history = controller?.getHistory?.() ?? [];
  } catch (_e) {
    history = [];
  }

  const run = () => {
    if (typeof afterAction === "function") afterAction();
  };

  if (!controller || history.length === 0) {
    run();
    return;
  }

  confirmationDialog({
    title: "Reset AI chat?",
    message:
      "Editing world:premise will reset the AI chat (which has snapshotted the previous premise). Reset chat now?",
    confirm: "Reset chat",
    cancel: "Keep chat",
    onConfirm: () => {
      try {
        controller.reset();
      } catch (e) {
        console.warn("Failed to reset AI chat", e);
      }
      run();
    },
    onCancel: () => {
      tip("Kept chat — note that it'll continue using the stale premise.", false, "warn", 4000);
      run();
    }
  });
}
