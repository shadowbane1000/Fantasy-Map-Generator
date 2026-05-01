export interface ToolResult {
  content: string;
  isError?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (input: unknown) => Promise<ToolResult> | ToolResult;
}

export interface AnthropicToolSchema {
  name: string;
  description: string;
  input_schema: Tool["input_schema"];
  cache_control?: { type: "ephemeral" };
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  toAnthropicSchemas(): AnthropicToolSchema[] {
    return this.list().map(({ name, description, input_schema }) => ({
      name,
      description,
      input_schema,
    }));
  }

  async run(name: string, input: unknown): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        isError: true,
        content: JSON.stringify({ error: `Unknown tool: ${name}` }),
      };
    }
    try {
      return await tool.execute(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: JSON.stringify({ error: message }),
      };
    }
  }
}
