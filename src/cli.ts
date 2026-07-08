#!/usr/bin/env node
import { Command } from "commander";
import { checkModalAuthentication } from "./services/modal.js";
import { jobRegistry } from "./core/jobs.js";
import { RunTestsInputSchema, RunTrainingJobInputSchema, RunFunctionInputSchema, JobIdInputSchema, ListJobsInputSchema } from "./schemas/inputs.js";
import { z } from "zod";

const program = new Command();

program
  .name("modal-mcp-server")
  .description("MCP server for running GPU-dependent Python workloads on Modal.com")
  .version("1.0.0")
  .option("--mcp", "Run as MCP stdio server (default if no subcommand)");

program
  .command("doctor")
  .description("Check Modal authentication and environment")
  .action(async () => {
    const result = await checkModalAuthentication();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  });

const commonOptions = (cmd: Command) => {
  return cmd
    .requiredOption("-p, --project-path <path>", "Absolute path to project directory")
    .option("-e, --extra-packages <packages...>", "Additional pip packages to install", [])
    .option("-r, --requirements-file <file>", "Requirements file relative to project path")
    .option("-s, --setup-command <cmd>", "Setup command to run before main command")
    .option("--gpu <type>", "GPU type (none, any, T4, L4, A10, L40S, A100, A100-40GB, A100-80GB, RTX-PRO-6000, H100, H100!, H200, B200, B200+)", "T4")
    .option("--timeout <seconds>", "Timeout in seconds", "300")
    .option("--python-version <version>", "Python version (e.g., 3.11)", "3.11")
    .option("--env <key=value>", "Environment variables (can be repeated)", (val, acc: Record<string, string>) => {
      const [key, value] = val.split("=");
      acc[key] = value;
      return acc;
    }, {})
    .option("--exclude-patterns <patterns...>", "Additional exclude patterns", [])
    .option("--max-upload-mb <mb>", "Max upload size in MiB", "512")
    .option("--volume-mount <volume:path>", "Mount a Modal Volume (format: volume_name:/mount/path)", (val, acc: {volumeName: string, mountPath: string}[]) => {
      const [volumeName, mountPath] = val.split(":");
      acc.push({ volumeName, mountPath });
      return acc;
    }, []);
};

program
  .command("run-tests")
  .description("Run tests on Modal GPU")
  .addOption(commonOptions(new Command()).options[0])
  .addOption(commonOptions(new Command()).options[1])
  .addOption(commonOptions(new Command()).options[2])
  .addOption(commonOptions(new Command()).options[3])
  .addOption(commonOptions(new Command()).options[4])
  .addOption(commonOptions(new Command()).options[5])
  .addOption(commonOptions(new Command()).options[6])
  .addOption(commonOptions(new Command()).options[7])
  .addOption(commonOptions(new Command()).options[8])
  .addOption(commonOptions(new Command()).options[9])
  .addOption(commonOptions(new Command()).options[10])
  .option("-c, --command <cmd>", "Test command", "pytest")
  .option("--wait", "Wait for completion (default: true)", true)
  .action(async (opts) => {
    const input = RunTestsInputSchema.parse({
      project_path: opts.projectPath,
      test_command: opts.command,
      extra_packages: opts.extraPackages,
      requirements_file: opts.requirementsFile,
      setup_command: opts.setupCommand,
      gpu: opts.gpu,
      timeout: parseInt(opts.timeout),
      python_version: opts.pythonVersion,
      env: opts.env,
      exclude_patterns: opts.excludePatterns,
      max_upload_mb: parseInt(opts.maxUploadMb),
      wait: opts.wait,
      volume_mounts: opts.volumeMount,
    });
    
    const result = await runCliJob(input, "tests");
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("run-function")
  .description("Run a Python script on Modal GPU")
  .addOption(commonOptions(new Command()).options[0])
  .addOption(commonOptions(new Command()).options[1])
  .addOption(commonOptions(new Command()).options[2])
  .addOption(commonOptions(new Command()).options[3])
  .addOption(commonOptions(new Command()).options[4])
  .addOption(commonOptions(new Command()).options[5])
  .addOption(commonOptions(new Command()).options[6])
  .addOption(commonOptions(new Command()).options[7])
  .addOption(commonOptions(new Command()).options[8])
  .addOption(commonOptions(new Command()).options[9])
  .addOption(commonOptions(new Command()).options[10])
  .requiredOption("--script <path>", "Python script path relative to project")
  .option("--args <args>", "Arguments to pass to script", "")
  .option("--wait", "Wait for completion (default: true)", true)
  .action(async (opts) => {
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
      env: opts.env,
      exclude_patterns: opts.excludePatterns,
      max_upload_mb: parseInt(opts.maxUploadMb),
      wait: opts.wait,
      volume_mounts: opts.volumeMount,
    });
    
    const result = await runCliJob(input, "script");
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("run-training")
  .description("Run training job on Modal GPU")
  .addOption(commonOptions(new Command()).options[0])
  .addOption(commonOptions(new Command()).options[1])
  .addOption(commonOptions(new Command()).options[2])
  .addOption(commonOptions(new Command()).options[3])
  .addOption(commonOptions(new Command()).options[4])
  .addOption(commonOptions(new Command()).options[5])
  .addOption(commonOptions(new Command()).options[6])
  .addOption(commonOptions(new Command()).options[7])
  .addOption(commonOptions(new Command()).options[8])
  .addOption(commonOptions(new Command()).options[9])
  .addOption(commonOptions(new Command()).options[10])
  .requiredOption("-c, --command <cmd>", "Training command")
  .option("--wait", "Wait for completion (default: false)", false)
  .action(async (opts) => {
    const input = RunTrainingJobInputSchema.parse({
      project_path: opts.projectPath,
      train_command: opts.command,
      extra_packages: opts.extraPackages,
      requirements_file: opts.requirementsFile,
      setup_command: opts.setupCommand,
      gpu: opts.gpu,
      timeout: parseInt(opts.timeout),
      python_version: opts.pythonVersion,
      env: opts.env,
      exclude_patterns: opts.excludePatterns,
      max_upload_mb: parseInt(opts.maxUploadMb),
      wait: opts.wait,
      volume_mounts: opts.volumeMount,
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
  .option("-f, --follow", "Follow logs (not implemented for CLI)", false)
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
    DEFAULT_APP_NAME
  } = await import("./core/config.js");
  const { startModalJob, waitForJob, toResult } = await import("./core/jobs.js");
  const { ProgressCallback } = await import("./core/types.js");

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
    // Use \r to overwrite the line for updating progress
    process.stderr.write(`\r${msg}`);
  };

  const started = await startModalJob({ ...config, onProgress: progressCallback });

  // Clear the progress line
  process.stderr.write("\r\x1b[K");

  if (!input.wait) {
    return {
      job_id: started.job.jobId,
      status: started.job.status,
      kind: started.job.kind,
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