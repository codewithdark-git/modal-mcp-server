import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkModalAuthentication, getModalClient } from "../services/modal.js";
import { errorResponse, jsonResponse } from "./responses.js";

export function registerDoctor(server: McpServer): void {
  server.registerTool(
    "modal_check_environment",
    {
      title: "Check Modal MCP Environment",
      description: "Check whether the Modal Node.js SDK is authenticated and available for this MCP server.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const result = await checkModalAuthentication();
        return jsonResponse({
          ok: result.ok,
          modal_authenticated: result.ok,
          modal_version: result.modalVersion ?? null,
          errors: result.errors,
          next_steps: result.ok
            ? []
            : [
                "Authenticate with Modal using MODAL_TOKEN_ID and MODAL_TOKEN_SECRET environment variables.",
                "Or run `modal setup` if you have the Modal Python CLI installed.",
                "See https://modal.com/docs/guide#getting-started for authentication options.",
              ],
        });
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
