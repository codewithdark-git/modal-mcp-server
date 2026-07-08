#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerDoctor } from "./tools/doctor.js";
import {
  registerCancelJob,
  registerGetJobResult,
  registerGetJobStatus,
  registerListJobs,
  registerStreamLogs,
} from "./tools/job-management.js";
import { registerRunFunction } from "./tools/run-function.js";
import { registerRunTests } from "./tools/run-tests.js";
import { registerRunTrainingJob } from "./tools/run-training-job.js";
import { checkModalAuthentication } from "./services/modal.js";

async function main(): Promise<void> {
  // Check if running as CLI (has subcommand) or MCP server (no args or --mcp flag)
  const args = process.argv.slice(2);
  const hasSubcommand = args.length > 0 && !args[0].startsWith("--");
  const isMcpMode = args.includes("--mcp") || (!hasSubcommand && !args.includes("--help") && !args.includes("-h") && !args.includes("-V") && !args.includes("--version"));

  if (hasSubcommand && !isMcpMode) {
    // Run CLI mode - delegate to cli.ts
    const { default: cliMain } = await import("./cli.js");
    await cliMain();
    return;
  }

  // MCP server mode (default)
  if (args[0] === "doctor") {
    const result = await checkModalAuthentication();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  const server = new McpServer(
    {
      name: "modal-mcp-server",
      version: "1.0.0",
    },
    {
      instructions:
        "Use this server to run GPU-dependent Python tests, training, inference, and benchmark commands on the user's Modal.com account. Prefer modal_run_tests after editing CUDA, PyTorch, JAX, TensorFlow, Triton, or GPU-sensitive code. Use wait=false for long jobs, then poll modal_get_job_status and modal_stream_logs.",
    }
  );

  registerDoctor(server);
  registerRunTests(server);
  registerRunTrainingJob(server);
  registerRunFunction(server);
  registerGetJobStatus(server);
  registerStreamLogs(server);
  registerGetJobResult(server);
  registerCancelJob(server);
  registerListJobs(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[modal-mcp-server] MCP server running on stdio.");
}

main().catch((error: unknown) => {
  console.error("[modal-mcp-server] Fatal error:", error);
  process.exit(1);
});