#!/usr/bin/env node
// CLI entry point for modal-mcp-server
// Provides direct CLI commands alongside MCP server mode

import { Command } from "commander";
import { checkModalAuthentication } from "./services/modal.js";
import { startModalJob, waitForJob, toResult } from "./core/jobs.js";
import type { ModalRunConfig } from "./core/types.js";
import { DEFAULT_APP_NAME, DEFAULT_EXCLUDE_PATTERNS, DEFAULT_GPU, DEFAULT_MAX_UPLOAD_MB, DEFAULT_PYTHON_VERSION, DEFAULT_TEST_TIMEOUT_SECONDS } from "./core/config.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { jobRegistry } from "./core/jobs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = join(__dirname, "..", "package.json");

try {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  const version = packageJson.version || "1.0.0";
  
  const program = new Command();

  program
    .name("modal-mcp-server")
    .description("Run GPU tests, training jobs, and Python workloads on Modal.com")
    .version(version);

  // Doctor command
  program
    .command("doctor")
    .description("Check Modal authentication and environment")
    .action(async () => {
      const result = await checkModalAuthentication();
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    });

  // Run tests command
  program
    .command("run-tests")
    .description("Run tests on Modal GPU")
    .requiredOption("--project-path <path>", "Absolute path to project directory")
    .option("--test-command <command>", "Test command to run", "pytest")
    .option("--gpu <gpu>", "GPU type", DEFAULT_GPU)
    .option("--python-version <version>", "Python version", DEFAULT_PYTHON_VERSION)
    .option("--timeout <seconds>", "Timeout in seconds", String, String(DEFAULT_TEST_TIMEOUT_SECONDS))
    .option("--requirements-file <file>", "Requirements file path")
    .option("--setup-command <command>", "Setup command to run before tests")
    .option("--extra-packages <packages...>", "Extra packages to install", [])
    .option("--exclude-patterns <patterns...>", "Exclude patterns", [])
    .option("--max-upload-mb <mb>", "Max upload size in MB", String, String(DEFAULT_MAX_UPLOAD_MB))
    .option("--wait", "Wait for completion", true)
    .option("--env <pairs...>", "Environment variables as KEY=VALUE pairs", [])
    .action(async (options) => {
      const config: ModalRunConfig = {
        kind: "tests",
        projectPath: options.projectPath,
        command: options.testCommand,
        gpu: options.gpu as any,
        pythonVersion: options.pythonVersion,
        timeoutSeconds: parseInt(options.timeout),
        extraPackages: options.extraPackages,
        requirementsFile: options.requirementsFile,
        setupCommand: options.setupCommand,
        env: parseEnvPairs(options.env),
        excludePatterns: [...DEFAULT_EXCLUDE_PATTERNS, ...options.excludePatterns],
        maxUploadMb: parseInt(options.maxUploadMb),
      };

      const started = await startModalJob(config);
      console.log(`Job started: ${started.job.jobId}`);
      
      if (options.wait) {
        console.log("Waiting for completion...");
        const completed = await waitForJob(started);
        const result = toResult(completed);
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.exit_code === 0 ? 0 : 1);
      } else {
        console.log("Job running in background. Use modal_get_job_status to check progress.");
        process.exit(0);
      }
    });

  // Run training job command
  program
    .command("run-training-job")
    .description("Run a training job on Modal GPU")
    .requiredOption("--project-path <path>", "Absolute path to project directory")
    .requiredOption("--train-command <command>", "Training command to run")
    .option("--gpu <gpu>", "GPU type", DEFAULT_GPU)
    .option("--python-version <version>", "Python version", DEFAULT_PYTHON_VERSION)
    .option("--timeout <seconds>", "Timeout in seconds", String, "86400")
    .option("--requirements-file <file>", "Requirements file path")
    .option("--setup-command <command>", "Setup command to run before training")
    .option("--extra-packages <packages...>", "Extra packages to install", [])
    .option("--exclude-patterns <patterns...>", "Exclude patterns", [])
    .option("--max-upload-mb <mb>", "Max upload size in MB", String, String(DEFAULT_MAX_UPLOAD_MB))
    .option("--wait", "Wait for completion", false)
    .option("--env <pairs...>", "Environment variables as KEY=VALUE pairs", [])
    .action(async (options) => {
      const config: ModalRunConfig = {
        kind: "training",
        projectPath: options.projectPath,
        command: options.trainCommand,
        gpu: options.gpu as any,
        pythonVersion: options.pythonVersion,
        timeoutSeconds: parseInt(options.timeout),
        extraPackages: options.extraPackages,
        requirementsFile: options.requirementsFile,
        setupCommand: options.setupCommand,
        env: parseEnvPairs(options.env),
        excludePatterns: [...DEFAULT_EXCLUDE_PATTERNS, ...options.excludePatterns],
        maxUploadMb: parseInt(options.maxUploadMb),
      };

      const started = await startModalJob(config);
      console.log(`Job started: ${started.job.jobId}`);
      
      if (options.wait) {
        console.log("Waiting for completion...");
        const completed = await waitForJob(started);
        const result = toResult(completed);
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.exit_code === 0 ? 0 : 1);
      } else {
        console.log("Job running in background. Use modal_get_job_status to check progress.");
        process.exit(0);
      }
    });

  // Run function command
  program
    .command("run-function")
    .description("Run a Python script on Modal GPU")
    .requiredOption("--project-path <path>", "Absolute path to project directory")
    .requiredOption("--script-path <path>", "Python script path relative to project")
    .option("--function-args <args>", "Arguments to pass to script", "")
    .option("--gpu <gpu>", "GPU type", DEFAULT_GPU)
    .option("--python-version <version>", "Python version", DEFAULT_PYTHON_VERSION)
    .option("--timeout <seconds>", "Timeout in seconds", String, String(DEFAULT_TEST_TIMEOUT_SECONDS))
    .option("--requirements-file <file>", "Requirements file path")
    .option("--setup-command <command>", "Setup command to run before script")
    .option("--extra-packages <packages...>", "Extra packages to install", [])
    .option("--exclude-patterns <patterns...>", "Exclude patterns", [])
    .option("--max-upload-mb <mb>", "Max upload size in MB", String, String(DEFAULT_MAX_UPLOAD_MB))
    .option("--wait", "Wait for completion", true)
    .option("--env <pairs...>", "Environment variables as KEY=VALUE pairs", [])
    .action(async (options) => {
      const command = `python ${options.scriptPath} ${options.functionArgs}`.trim();
      
      const config: ModalRunConfig = {
        kind: "script",
        projectPath: options.projectPath,
        command: command,
        gpu: options.gpu as any,
        pythonVersion: options.pythonVersion,
        timeoutSeconds: parseInt(options.timeout),
        extraPackages: options.extraPackages,
        requirementsFile: options.requirementsFile,
        setupCommand: options.setupCommand,
        env: parseEnvPairs(options.env),
        excludePatterns: [...DEFAULT_EXCLUDE_PATTERNS, ...options.excludePatterns],
        maxUploadMb: parseInt(options.maxUploadMb),
      };

      const started = await startModalJob(config);
      console.log(`Job started: ${started.job.jobId}`);
      
      if (options.wait) {
        console.log("Waiting for completion...");
        const completed = await waitForJob(started);
        const result = toResult(completed);
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.exit_code === 0 ? 0 : 1);
      } else {
        console.log("Job running in background. Use modal_get_job_status to check progress.");
        process.exit(0);
      }
    });

  // List jobs command
  program
    .command("list-jobs")
    .description("List recent jobs")
    .option("--limit <limit>", "Maximum number of jobs to show", "20")
    .action(async (options) => {
      const limit = parseInt(options.limit);
      const jobs = Array.from(jobRegistry.values())
        .map(({ job }) => job)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, limit)
        .map((job) => ({
          job_id: job.jobId,
          status: job.status,
          kind: job.kind,
          gpu: job.gpu,
          started_at: job.startedAt,
          command: job.command,
        }));
      
      console.log(JSON.stringify({ jobs, total: jobRegistry.size }, null, 2));
    });

  // Cancel job command
  program
    .command("cancel-job")
    .description("Cancel a running job")
    .requiredOption("--job-id <id>", "Job ID to cancel")
    .action(async (options) => {
      const started = jobRegistry.get(options.jobId);
      if (!started) {
        console.error(`Job not found: ${options.jobId}`);
        process.exit(1);
      }
      
      if (started.job.status !== "running" && started.job.status !== "pending") {
        console.log(`Job ${options.jobId} is not running (status: ${started.job.status})`);
        process.exit(0);
      }
      
      started.cancel();
      console.log(`Job ${options.jobId} cancelled`);
      process.exit(0);
    });

  // Get job status command
  program
    .command("get-job-status")
    .description("Get job status")
    .requiredOption("--job-id <id>", "Job ID")
    .action(async (options) => {
      const started = jobRegistry.get(options.jobId);
      if (!started) {
        console.error(`Job not found: ${options.jobId}`);
        process.exit(1);
      }
      
      const job = started.job;
      console.log(JSON.stringify({
        job_id: job.jobId,
        status: job.status,
        kind: job.kind,
        gpu: job.gpu,
        started_at: job.startedAt,
        completed_at: job.completedAt,
        sandbox_id: job.sandboxId,
        project_path: job.projectPath,
        command: job.command,
        exit_code: job.exitCode ?? null,
        duration_ms: job.durationMs ?? null,
        error: job.error,
      }, null, 2));
    });

  // Stream logs command
  program
    .command("stream-logs")
    .description("Stream job logs")
    .requiredOption("--job-id <id>", "Job ID")
    .option("--follow", "Follow logs in real-time", false)
    .action(async (options) => {
      const started = jobRegistry.get(options.jobId);
      if (!started) {
        console.error(`Job not found: ${options.jobId}`);
        process.exit(1);
      }
      
      console.log(JSON.stringify({
        job_id: options.jobId,
        status: started.job.status,
        log_lines: started.job.logs,
        line_count: started.job.logs.length,
      }, null, 2));
    });

  // Parse arguments
  program.parse(process.argv);

  // If no command specified, show help
  if (process.argv.length === 2) {
    program.help();
    process.exit(0);
  }

} catch (error) {
  console.error("Error loading package.json:", error);
  // Fallback for when commander is not available
  if (process.argv[2] === "doctor") {
    const result = await checkModalAuthentication();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } else {
    console.log("Starting MCP server mode...");
    process.exit(0);
  }
}

function parseEnvPairs(pairs: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const pair of pairs) {
    const [key, value] = pair.split("=", 2);
    if (key && value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}
