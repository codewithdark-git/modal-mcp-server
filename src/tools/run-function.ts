import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_GPU,
  DEFAULT_PYTHON_VERSION,
  DEFAULT_SCRIPT_TIMEOUT_SECONDS,
} from "../core/config.js";
import { startModalJob, toResult, waitForJob } from "../core/jobs.js";
import type { ModalRunConfig } from "../core/types.js";
import { RunFunctionInputSchema, type RunFunctionInput } from "../schemas/inputs.js";
import { errorResponse, jobResultResponse, jobStartedResponse } from "./responses.js";

export function registerRunFunction(server: McpServer): void {
  server.registerTool(
    "modal_run_function",
    {
      title: "Run Python Script on Modal GPU",
      description:
        "Run a Python script from a local project in a Modal GPU sandbox for inference, evaluation, benchmarks, or ad hoc GPU work. Use gpu='none' for CPU-only execution.",
      inputSchema: RunFunctionInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (rawInput: unknown) => {
      try {
        const input = RunFunctionInputSchema.parse(rawInput);
        const started = await startModalJob(toConfig(input));
        if (!input.wait) return jobStartedResponse(started.job);
        const completed = await waitForJob(started);
        return jobResultResponse(toResult(completed));
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}

function toConfig(input: RunFunctionInput): ModalRunConfig {
  const script = input.script_path.replaceAll("\\", "/");
  if (path.isAbsolute(script) || script.includes("..")) {
    throw new Error("script_path must be a relative path inside project_path.");
  }
  const args = input.function_args ? ` ${input.function_args}` : "";
  return {
    kind: "script",
    projectPath: input.project_path,
    command: `python ${shellQuote(script)}${args}`,
    extraPackages: input.extra_packages,
    gpu: input.gpu ?? DEFAULT_GPU,
    timeoutSeconds: input.timeout ?? DEFAULT_SCRIPT_TIMEOUT_SECONDS,
    pythonVersion: input.python_version ?? DEFAULT_PYTHON_VERSION,
    requirementsFile: input.requirements_file,
    setupCommand: input.setup_command,
    env: input.env,
    excludePatterns: [...DEFAULT_EXCLUDE_PATTERNS, ...input.exclude_patterns],
    maxUploadMb: input.max_upload_mb,
    concurrencyLimit: input.concurrency_limit,
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
