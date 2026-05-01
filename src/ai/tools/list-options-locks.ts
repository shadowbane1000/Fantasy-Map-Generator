import { okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  defaultOptionsLockRuntime,
  OPTIONS_LOCK_DISPLAY_NAMES,
  OPTIONS_LOCK_KEYS,
  type OptionsLockKey,
  type OptionsLockRuntime,
  REGENERATION_GATING_LOCKS,
} from "./set-options-lock";

export function createListOptionsLocksTool(
  runtime: OptionsLockRuntime = defaultOptionsLockRuntime,
): Tool {
  return {
    name: "list_options_locks",
    description: `Read the current state of every Options-dialog / World-configurator lock. Returns one entry per lockable setting with \`{id, displayName, locked, gatesRegeneration}\`. \`gatesRegeneration\` is true for the locks that \`regenerate_map\`'s \`randomizeOptions()\` actually consults (template, statesNumber, cultures, climate, etc.) — locking other settings only affects localStorage persistence across reloads. Use this before \`regenerate_map\` to confirm the user's intent is reflected in the locks; pair with \`set_options_lock\` to adjust. Read-only.`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(): ToolResult {
      const entries = OPTIONS_LOCK_KEYS.map((id: OptionsLockKey) => ({
        id,
        displayName: OPTIONS_LOCK_DISPLAY_NAMES[id],
        locked: runtime.isLocked(id),
        gatesRegeneration: REGENERATION_GATING_LOCKS.has(id),
      }));
      return okResult({
        locks: entries,
        lockedCount: entries.filter((e) => e.locked).length,
      });
    },
  };
}

export const listOptionsLocksTool = createListOptionsLocksTool();
