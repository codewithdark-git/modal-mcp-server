import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_GPU,
  DEFAULT_PYTHON_VERSION,
  DEFAULT_TRAINING_TIMEOUT_SECONDS,
} from "../core/config.js";
import { startModalJob, toResult, waitForJob } from "../core/jobs.js";
import type { ModalRunConfig } from "../core/types.js";
import { RunTrainingJobInputSchema, type RunTrainingJobInput } from "../schemas/inputs.js";
import { errorResponse, jobResultResponse, jobStartedResponse } from "./responses.js";

export function registerRunTrainingJob(server: McpServer): void {
  server.registerTool(
    "modal_run_training_job",
    {
      title: "Run Training Job on Modal GPU",
      description:
        "Launch a training or fine-tuning command on a Modal GPU sandbox. Defaults to background mode so agents can poll status and logs. Use gpu='none' for CPU-only execution.",
      inputSchema: RunTrainingJobInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (rawInput: unknown) => {
      try {
        const input = RunTrainingJobInputSchema.parse(rawInput);
        const config = toConfig(input);
        const started = await startModalJob(config);
        if (!input.wait) return jobStartedResponse(started.job);
        const completed = await waitForJob(started);
        return jobResultResponse(toResult(completed));
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}

export function toConfig(input: RunTrainingJobInput): ModalRunConfig {
  return {
    kind: "training",
    projectPath: input.project_path,
    command: input.train_command,
    extraPackages: input.extra_packages,
    gpu: input.gpu ?? DEFAULT_GPU,
    timeoutSeconds: input.timeout ?? DEFAULT_TRAINING_TIMEOUT_SECONDS,
    pythonVersion: input.python_version ?? DEFAULT_PYTHON_VERSION,
    requirementsFile: input.requirements_file,
    setupCommand: input.setup_command,
    env: input.env,
    excludePatterns: [...DEFAULT_EXCLUDE_PATTERNS, ...input.exclude_patterns],
    maxUploadMb: input.max_upload_mb,
    concurrencyLimit: input.concurrency_limit,
  };
}
