"use strict";

/**
 * Auto-populate predefined empty world notes on map:generated.
 *
 * When a fresh map is generated and `window.notes` contains no
 * `world:*` ids, this initializer creates 6 predefined empty notes
 * (premise, cosmology, pantheon, magic, calendar, history) so the
 * user can immediately start filling them in via the notes editor.
 *
 * Idempotent: if any `world:*` note already exists (e.g. the user
 * deliberately deleted some), no auto-population happens. This
 * preserves user intent across regenerate-map cycles.
 *
 * Implements plan 373 (Layer 4 of the world-building feature).
 */

const PREDEFINED_WORLD_NOTE_TOPICS = ["premise", "cosmology", "pantheon", "magic", "calendar", "history"];

function buildDefaultWorldNotes() {
  return PREDEFINED_WORLD_NOTE_TOPICS.map(topic => ({
    id: "world:" + topic,
    name: "World — " + topic.charAt(0).toUpperCase() + topic.slice(1),
    legend: ""
  }));
}

function decideWorldNotesToAutoPopulate(notesArray) {
  if (!Array.isArray(notesArray)) return buildDefaultWorldNotes();
  const hasAnyWorldNote = notesArray.some(n => n && typeof n.id === "string" && n.id.startsWith("world:"));
  if (hasAnyWorldNote) return [];
  return buildDefaultWorldNotes();
}

function ensureWorldNotes() {
  if (!Array.isArray(window.notes)) window.notes = [];
  const toAdd = decideWorldNotesToAutoPopulate(window.notes);
  for (const note of toAdd) window.notes.push(note);
}

window.addEventListener("map:generated", ensureWorldNotes);

// Exposed for unit tests; not used by production code.
window.__worldNotesAutoPopulate = {
  PREDEFINED: PREDEFINED_WORLD_NOTE_TOPICS,
  buildDefaults: buildDefaultWorldNotes,
  decideAutoPopulate: decideWorldNotesToAutoPopulate,
  ensureWorldNotes: ensureWorldNotes
};
