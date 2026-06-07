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
import { checkPythonEnvironment } from "./services/python.js";

async function main(): Promise<void> {
  if (process.argv[2] === "doctor") {
    const result = await checkPythonEnvironment({ python: readFlag("--python") });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  const server = new McpServer(
    {
      name: "modal-mcp-server",
      version: "0.1.0",
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
