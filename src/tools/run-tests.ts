import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_GPU,
  DEFAULT_PYTHON_VERSION,
  DEFAULT_TEST_TIMEOUT_SECONDS,
} from "../core/config.js";
import { startModalJob, toResult, waitForJob } from "../core/jobs.js";
import type { ModalRunConfig } from "../core/types.js";
import { RunTestsInputSchema, type RunTestsInput } from "../schemas/inputs.js";
import { errorResponse, jobResultResponse, jobStartedResponse } from "./responses.js";

export function registerRunTests(server: McpServer): void {
  server.registerTool(
    "modal_run_tests",
    {
      title: "Run Tests on Modal GPU",
      description:
        "Upload a local Python project to a Modal GPU sandbox, install optional dependencies, run pytest or another test command, and return real GPU output.",
      inputSchema: RunTestsInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (rawInput: unknown) => {
      try {
        const input = RunTestsInputSchema.parse(rawInput);
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

function toConfig(input: RunTestsInput): ModalRunConfig {
  return {
    kind: "tests",
    projectPath: input.project_path,
    command: input.test_command,
    extraPackages: input.extra_packages,
    gpu: input.gpu ?? DEFAULT_GPU,
    timeoutSeconds: input.timeout ?? DEFAULT_TEST_TIMEOUT_SECONDS,
    pythonVersion: input.python_version ?? DEFAULT_PYTHON_VERSION,
    requirementsFile: input.requirements_file,
    setupCommand: input.setup_command,
    env: input.env,
    excludePatterns: [...DEFAULT_EXCLUDE_PATTERNS, ...input.exclude_patterns],
    maxUploadMb: input.max_upload_mb,
  };
}
