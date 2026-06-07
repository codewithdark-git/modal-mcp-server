import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkPythonEnvironment } from "../services/python.js";
import { errorResponse, jsonResponse } from "./responses.js";

export function registerDoctor(server: McpServer): void {
  server.registerTool(
    "modal_check_environment",
    {
      title: "Check Modal MCP Environment",
      description: "Check whether Python and the Modal Python package are available for this MCP server.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const result = await checkPythonEnvironment();
        return jsonResponse({
          ok: result.ok,
          python: result.python
            ? {
                command: [result.python.command, ...result.python.args].join(" "),
                version: result.python.version,
              }
            : null,
          modal_version: result.modalVersion ?? null,
          errors: result.errors,
          next_steps: result.ok
            ? []
            : ["Install Modal with `python -m pip install modal`.", "Authenticate with `modal setup` or MODAL_TOKEN_ID/MODAL_TOKEN_SECRET."],
        });
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
