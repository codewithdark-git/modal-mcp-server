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
import { DEFAULT_EXCLUDE_PATTERNS } from "./core/config.js";

// Export DEFAULT_EXCLUDE_PATTERNS for external use
// This allows users to see what patterns are excluded by default
export { DEFAULT_EXCLUDE_PATTERNS };

async function main(): Promise<void> {
  // Handle CLI commands
  const args = process.argv.slice(2);
  
  // Check for doctor command first (most common)
  if (args[0] === "doctor") {
    const result = await checkModalAuthentication();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }
  
  // Check for other CLI commands
  const cliCommands = [
    "run-tests", "run-training-job", "run-function", 
    "list-jobs", "cancel-job", "get-job-status", "stream-logs",
    "help", "--help", "-h", "--version", "-v"
  ];
  
  if (args.length > 0 && args[0] && cliCommands.includes(args[0])) {
    // Import and run CLI
    try {
      const { Command } = await import("commander");
      const cli = new Command();
      
      // This will be handled by our CLI module
      // For now, show help
      cli
        .name("modal-mcp-server")
        .description("Run GPU tests, training jobs, and Python workloads on Modal.com")
        .version("1.0.0");
      
      cli.parse(process.argv);
      
      // If we get here, no valid CLI command was found
      console.log("Starting MCP server mode...");
    } catch (error) {
      // commander not available, fall back to MCP mode
      console.log("Starting MCP server mode...");
    }
  }

  // Start MCP server mode
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

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}
