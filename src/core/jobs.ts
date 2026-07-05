import { randomUUID } from "node:crypto";
import type { JobInfo, JobResult, ModalRunConfig, StartedJob } from "./types.js";
import { executeModalJob, type ModalJobConfig, type ModalJobResult } from "../services/modal.js";
import { DEFAULT_APP_NAME } from "./config.js";

export const jobRegistry = new Map<string, StartedJob>();

export function generateJobId(): string {
  return `job_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

export async function startModalJob(config: ModalRunConfig): Promise<StartedJob> {
  const job: JobInfo = {
    jobId: generateJobId(),
    status: "pending",
    kind: config.kind,
    startedAt: new Date().toISOString(),
    projectPath: config.projectPath,
    command: config.command,
    gpu: config.gpu,
    timeoutSeconds: config.timeoutSeconds,
    stdout: "",
    stderr: "",
    logs: [],
  };

  job.status = "running";
  appendLog(job, "modal", `Starting Modal ${config.kind} job on ${config.gpu}.`);

  // Convert ModalRunConfig to ModalJobConfig
  const modalConfig: ModalJobConfig = {
    appName: DEFAULT_APP_NAME,
    pythonVersion: config.pythonVersion,
    gpu: config.gpu,
    timeoutSeconds: config.timeoutSeconds,
    projectPath: config.projectPath,
    command: config.command,
    extraPackages: config.extraPackages,
    requirementsFile: config.requirementsFile,
    setupCommand: config.setupCommand,
    env: config.env,
    excludePatterns: config.excludePatterns,
    maxUploadMb: config.maxUploadMb,
    concurrencyLimit: config.concurrencyLimit,
    onProgress: (progress) => {
      appendLog(job, "upload", 
        `Uploading: ${progress.uploaded}/${progress.total} files (${progress.currentFile || "..."})`
      );
    },
    onLog: (level, message) => {
      appendLog(job, level, message);
    },
  };

  const done = executeJob(job, modalConfig);
  const started: StartedJob = {
    job,
    done,
    cancel: () => {
      if (job.status === "running" || job.status === "pending") {
        appendLog(job, "modal", "Cancellation requested.");
        job.status = "cancelled";
        // Note: With Node.js SDK, we need to track the sandbox to cancel it
        // This will be implemented in the Modal service
      }
    },
  };

  jobRegistry.set(job.jobId, started);
  return started;
}

export async function waitForJob(started: StartedJob): Promise<JobInfo> {
  return started.done;
}

export function toResult(job: JobInfo): JobResult {
  return {
    job_id: job.jobId,
    status: job.status,
    exit_code: job.exitCode ?? null,
    stdout: job.stdout,
    stderr: job.stderr,
    duration_ms: job.durationMs ?? 0,
  };
}

async function executeJob(job: JobInfo, config: ModalJobConfig): Promise<JobInfo> {
  try {
    appendLog(job, "modal", `Creating Modal sandbox with GPU=${config.gpu}, Python=${config.pythonVersion}`);
    
    const result = await executeModalJob(config);
    
    // Update job with results
    job.sandboxId = result.sandboxId;
    job.exitCode = result.exitCode;
    job.stdout = result.stdout;
    job.stderr = result.stderr;
    job.durationMs = result.durationMs;
    job.status = result.exitCode === 0 ? "success" : "failed";
    
    appendLog(job, "modal", `Finished with exit code ${result.exitCode}.`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    failJob(job, errorMessage);
    appendLog(job, "error", errorMessage);
    
    // Extract additional error details if available
    if (error instanceof Error && error.cause) {
      appendLog(job, "error", `Cause: ${String(error.cause)}`);
    }
  }
  
  job.completedAt = new Date().toISOString();
  return job;
}

function appendLog(job: JobInfo, stream: string, text: string): void {
  const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text;
  job.logs.push(`[${new Date().toISOString()}] [${stream}] ${trimmed}`);
}

function failJob(job: JobInfo, message: string): void {
  if (job.status !== "cancelled") job.status = "failed";
  job.error = message;
  appendLog(job, "error", message);
}
