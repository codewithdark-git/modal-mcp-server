#!/usr/bin/env node
import { Command, Option } from "commander";
import { checkModalAuthentication } from "./services/modal.js";
import { jobRegistry } from "./core/jobs.js";
import { RunTestsInputSchema, RunTrainingJobInputSchema, RunFunctionInputSchema, JobIdInputSchema, ListJobsInputSchema } from "./schemas/inputs.js";
import { z } from "zod";
import { startModalJob, waitForJob, toResult } from "./core/jobs.js";
import type { ProgressCallback } from "./core/types.js";

const program = new Command();

program
  .name("modal-mcp-server")
  .description("MCP server for running GPU-dependent Python workloads on Modal.com")
  .version("2.0.0")
  .option("--mcp", "Run as MCP stdio server (default if no subcommand)");

program
  .command("doctor")
  .description("Check Modal authentication and environment")
  .action(async () => {
    const result = await checkModalAuthentication();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  });

// Reusable Option objects
const projectPathOpt = new Option("-p, --project-path <path>", "Absolute path to project directory").makeOptionMandatory(true);
const extraPackagesOpt = new Option("-e, --extra-packages <packages...>", "Additional pip packages to install").default([]);
const requirementsFileOpt = new Option("-r, --requirements-file <file>", "Requirements file relative to project path");
const setupCommandOpt = new Option("-s, --setup-command <cmd>", "Setup command to run before main command");
const gpuOpt = new Option("--gpu <type>", "GPU type (none, any, T4, L4, A10, L40S, A100, A100-40GB, A100-80GB, RTX-PRO-6000, H100, H100!, H200, B200, B200+)").default("T4");
const timeoutOpt = new Option("--timeout <seconds>", "Timeout in seconds").default("300");
const pythonVersionOpt = new Option("--python-version <version>", "Python version (e.g., 3.11)").default("3.11");
const envOpt = new Option("--env <key=value>", "Environment variables (can be repeated)").default("");
const excludePatternsOpt = new Option("--exclude-patterns <patterns...>", "Additional exclude patterns").default([]);
const maxUploadMbOpt = new Option("--max-upload-mb <mb>", "Max upload size in MiB").default("512");
const volumeMountOpt = new Option("--volume-mount <volume:path>", "Mount a Modal Volume (format: volume_name:/mount/path)").default("");
const concurrencyLimitOpt = new Option("--concurrency-limit <num>", "Max concurrent file uploads").default("10");

function addCommonOptions(cmd: Command): Command {
  return cmd
    .addOption(projectPathOpt)
    .addOption(extraPackagesOpt)
    .addOption(requirementsFileOpt)
    .addOption(setupCommandOpt)
    .addOption(gpuOpt)
    .addOption(timeoutOpt)
    .addOption(pythonVersionOpt)
    .addOption(envOpt)
    .addOption(excludePatternsOpt)
    .addOption(maxUploadMbOpt)
    .addOption(volumeMountOpt)
    .addOption(concurrencyLimitOpt);
}

addCommonOptions(program
  .command("run-tests")
  .description("Run tests on Modal GPU"))
  .option("-c, --command <cmd>", "Test command", "pytest")
  .option("--wait", "Wait for completion (default: true)", true)
  .action(async (opts) => {
    // Parse env string into object
    const env: Record<string, string> = {};
    if (opts.env) {
      opts.env.split(",").forEach((pair: string) => {
        const [key, value] = pair.split("=");
        if (key && value) env[key] = value;
      });
    }
    // Parse volume mounts
    const volumeMounts: {volumeName: string, mountPath: string}[] = [];
    if (opts.volumeMount) {
      opts.volumeMount.split(",").forEach((pair: string) => {
        const [volumeName, mountPath] = pair.split(":");
        if (volumeName && mountPath) volumeMounts.push({ volumeName, mountPath });
      });
    }

    const input = RunTestsInputSchema.parse({
      project_path: opts.projectPath,
      test_command: opts.command,
      extra_packages: opts.extraPackages,
      requirements_file: opts.requirementsFile,
      setup_command: opts.setupCommand,
      gpu: opts.gpu,
      timeout: parseInt(opts.timeout),
      python_version: opts.pythonVersion,
      env: env,
      exclude_patterns: opts.excludePatterns,
      max_upload_mb: parseInt(opts.maxUploadMb),
      wait: opts.wait,
      volume_mounts: volumeMounts,
      concurrency_limit: parseInt(opts.concurrencyLimit),
    });

    const result = await runCliJob(input, "tests");
    console.log(JSON.stringify(result, null, 2));
  });

addCommonOptions(program
  .command("run-function")
  .description("Run a Python script on Modal GPU"))
  .requiredOption("--script <path>", "Python script path relative to project")
  .option("--args <args>", "Arguments to pass to script", "")
  .option("--wait", "Wait for completion (default: true)", true)
  .action(async (opts) => {
    // Parse env string into object
    const env: Record<string, string> = {};
    if (opts.env) {
      opts.env.split(",").forEach((pair: string) => {
        const [key, value] = pair.split("=");
        if (key && value) env[key] = value;
      });
    }
    // Parse volume mounts
    const volumeMounts: {volumeName: string, mountPath: string}[] = [];
    if (opts.volumeMount) {
      opts.volumeMount.split(",").forEach((pair: string) => {
        const [volumeName, mountPath] = pair.split(":");
        if (volumeName && mountPath) volumeMounts.push({ volumeName, mountPath });
      });
    }

    const input = RunFunctionInputSchema.parse({
      project_path: opts.projectPath,
      script_path: opts.script,
      function_args: opts.args,
      extra_packages: opts.extraPackages,
      requirements_file: opts.requirementsFile,
      setup_command: opts.setupCommand,
      gpu: opts.gpu,
      timeout: parseInt(opts.timeout),
      python_version: opts.pythonVersion,
      env: env,
      exclude_patterns: opts.excludePatterns,
      max_upload_mb: parseInt(opts.maxUploadMb),
      wait: opts.wait,
      volume_mounts: volumeMounts,
      concurrency_limit: parseInt(opts.concurrencyLimit),
    });

    const result = await runCliJob(input, "script");
    console.log(JSON.stringify(result, null, 2));
  });

addCommonOptions(program
  .command("run-training")
  .description("Run training job on Modal GPU"))
  .requiredOption("-c, --command <cmd>", "Training command")
  .option("--wait", "Wait for completion (default: false)", false)
  .action(async (opts) => {
    // Parse env string into object
    const env: Record<string, string> = {};
    if (opts.env) {
      opts.env.split(",").forEach((pair: string) => {
        const [key, value] = pair.split("=");
        if (key && value) env[key] = value;
      });
    }
    // Parse volume mounts
    const volumeMounts: {volumeName: string, mountPath: string}[] = [];
    if (opts.volumeMount) {
      opts.volumeMount.split(",").forEach((pair: string) => {
        const [volumeName, mountPath] = pair.split(":");
        if (volumeName && mountPath) volumeMounts.push({ volumeName, mountPath });
      });
    }

    const input = RunTrainingJobInputSchema.parse({
      project_path: opts.projectPath,
      train_command: opts.command,
      extra_packages: opts.extraPackages,
      requirements_file: opts.requirementsFile,
      setup_command: opts.setupCommand,
      gpu: opts.gpu,
      timeout: parseInt(opts.timeout),
      python_version: opts.pythonVersion,
      env: env,
      exclude_patterns: opts.excludePatterns,
      max_upload_mb: parseInt(opts.maxUploadMb),
      wait: opts.wait,
      volume_mounts: volumeMounts,
      concurrency_limit: parseInt(opts.concurrencyLimit),
    });

    const result = await runCliJob(input, "training");
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("list-jobs")
  .description("List recent jobs")
  .option("-l, --limit <num>", "Max jobs to list", "20")
  .action(async (opts) => {
    const { limit } = ListJobsInputSchema.parse({ limit: parseInt(opts.limit) });
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

program
  .command("get-status")
  .description("Get job status")
  .requiredOption("-j, --job-id <id>", "Job ID")
  .action(async (opts) => {
    const { job_id } = JobIdInputSchema.parse({ job_id: opts.jobId });
    const started = jobRegistry.get(job_id);
    if (!started) {
      console.error(JSON.stringify({ error: `Job not found: ${job_id}` }, null, 2));
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

program
  .command("get-result")
  .description("Get job result (stdout, stderr, exit code)")
  .requiredOption("-j, --job-id <id>", "Job ID")
  .action(async (opts) => {
    const { job_id } = JobIdInputSchema.parse({ job_id: opts.jobId });
    const started = jobRegistry.get(job_id);
    if (!started) {
      console.error(JSON.stringify({ error: `Job not found: ${job_id}` }, null, 2));
      process.exit(1);
    }
    const job = started.job;
    console.log(JSON.stringify({
      job_id: job.jobId,
      status: job.status,
      exit_code: job.exitCode ?? null,
      stdout: job.stdout,
      stderr: job.stderr,
      duration_ms: job.durationMs ?? 0,
    }, null, 2));
  });

program
  .command("logs")
  .description("Get job logs")
  .requiredOption("-j, --job-id <id>", "Job ID")
  .option("-f, --follow", "Follow logs (polling stream)", false)
  .action(async (opts) => {
    const { job_id } = JobIdInputSchema.parse({ job_id: opts.jobId });
    const started = jobRegistry.get(job_id);
    if (!started) {
      console.error(JSON.stringify({ error: `Job not found: ${job_id}` }, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify({
      job_id,
      status: started.job.status,
      log_lines: started.job.logs,
      line_count: started.job.logs.length,
    }, null, 2));
  });

program
  .command("cancel-job")
  .description("Cancel a running job")
  .requiredOption("-j, --job-id <id>", "Job ID")
  .action(async (opts) => {
    const { job_id } = JobIdInputSchema.parse({ job_id: opts.jobId });
    const started = jobRegistry.get(job_id);
    if (!started) {
      console.error(JSON.stringify({ error: `Job not found: ${job_id}` }, null, 2));
      process.exit(1);
    }
    if (started.job.status !== "running" && started.job.status !== "pending") {
      console.log(JSON.stringify({ job_id, cancelled: false, status: started.job.status }, null, 2));
      return;
    }
    started.cancel();
    console.log(JSON.stringify({ job_id, cancelled: true, status: started.job.status }, null, 2));
  });

async function runCliJob(input: any, kind: "tests" | "training" | "script"): Promise<any> {
  const {
    DEFAULT_GPU,
    DEFAULT_PYTHON_VERSION,
    DEFAULT_TEST_TIMEOUT_SECONDS,
    DEFAULT_SCRIPT_TIMEOUT_SECONDS,
    DEFAULT_TRAINING_TIMEOUT_SECONDS,
    DEFAULT_EXCLUDE_PATTERNS,
    DEFAULT_APP_NAME,
  } = await import("./core/config.js");

  let toConfig: any;
  if (kind === "tests") {
    const { toConfig: tc } = await import("./tools/run-tests.js");
    toConfig = tc;
  } else if (kind === "training") {
    const { toConfig: tc } = await import("./tools/run-training-job.js");
    toConfig = tc;
  } else {
    const { toConfig: tc } = await import("./tools/run-function.js");
    toConfig = tc;
  }

  const config = toConfig(input);

  // Progress callback for CLI - prints to stderr to not interfere with JSON output
  const progressCallback: ProgressCallback = (progress) => {
    const prefix = `[${progress.phase}]`;
    let msg = `${prefix} `;
    if (progress.total > 0) {
      msg += `${progress.completed}/${progress.total}`;
    }
    if (progress.currentFile) {
      msg += ` - ${progress.currentFile}`;
    }
    if (progress.message) {
      msg += ` - ${progress.message}`;
    }
    process.stderr.write(`\r${msg}`);
  };

  config.onProgress = progressCallback;

  const started = await startModalJob({ ...config, onProgress: progressCallback });

  // Clear the progress line
  process.stderr.write("\r\x1b[K");

  if (!input.wait) {
    return {
      job_id: started.job.jobId,
      status: started.job.status,
      kind: kind,
      gpu: started.job.gpu,
      started_at: started.job.startedAt,
      command: started.job.command,
      message: "Job started. Use modal_get_job_status and modal_stream_logs to monitor it.",
    };
  }

  const completed = await waitForJob(started);
  return toResult(completed);
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});

if (!process.argv.slice(2).length) {
  program.help();
}

export async function cliMain(): Promise<void> {
  await program.parseAsync(process.argv);
}