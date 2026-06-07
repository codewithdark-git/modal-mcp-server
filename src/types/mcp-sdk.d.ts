declare module "@modelcontextprotocol/sdk/server/mcp.js" {
  export class McpServer {
    constructor(info: { name: string; version: string }, options?: { instructions?: string });
    registerTool(
      name: string,
      config: {
        title?: string;
        description?: string;
        inputSchema?: unknown;
        annotations?: Record<string, unknown>;
      },
      handler: (input: unknown) => Promise<unknown> | unknown
    ): void;
    connect(transport: unknown): Promise<void>;
  }
}

declare module "@modelcontextprotocol/sdk/server/stdio.js" {
  export class StdioServerTransport {
    constructor();
  }
}
