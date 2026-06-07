import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JobInfo, JobResult, ModalRunConfig, StartedJob } from "./types.js";
import { findPython } from "../services/python.js";

export const jobRegistry = new Map<string, StartedJob>();

type RunnerEvent =
  | { type: "log"; stream: "stdout" | "stderr" | "modal" | "setup"; text: string }
  | { type: "sandbox"; sandbox_id: string }
  | { type: "result"; exit_code: number; stdout: string; stderr: string; duration_ms: number }
  | { type: "error"; message: string; traceback?: string };

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

  const python = await findPython();
  const runnerPath = join(dirname(dirname(fileURLToPath(import.meta.url))), "python", "modal_runner.py");
  const child = spawn(python.command, [...python.args, runnerPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
    windowsHide: true,
  });

  job.status = "running";
  appendLog(job, "modal", `Starting Modal ${config.kind} job on ${config.gpu}.`);

  const payload = JSON.stringify(config);
  child.stdin.end(payload);

  const done = observeChild(job, child);
  const started: StartedJob = {
    job,
    done,
    cancel: () => {
      if (job.status === "running" || job.status === "pending") {
        appendLog(job, "modal", "Cancellation requested.");
        job.status = "cancelled";
        child.kill("SIGTERM");
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

function observeChild(job: JobInfo, child: ChildProcessWithoutNullStreams): Promise<JobInfo> {
  let stdoutBuffer = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      consumeEventLine(job, line);
    }
  });

  child.stderr.on("data", (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.trim()) appendLog(job, "runner", line);
    }
  });

  return new Promise((resolve) => {
    child.on("error", (err) => {
      failJob(job, err.message);
      resolve(job);
    });

    child.on("close", (code, signal) => {
      if (stdoutBuffer.trim()) consumeEventLine(job, stdoutBuffer);
      if (job.status === "running" || job.status === "pending") {
        if (code === 0 && job.exitCode === 0) {
          job.status = "success";
        } else {
          failJob(job, `Runner exited with code ${code ?? "null"}${signal ? ` signal ${signal}` : ""}.`);
        }
      }
      job.completedAt = new Date().toISOString();
      resolve(job);
    });
  });
}

function consumeEventLine(job: JobInfo, line: string): void {
  if (!line.trim()) return;
  try {
    const event = JSON.parse(line) as RunnerEvent;
    if (event.type === "log") {
      appendLog(job, event.stream, event.text);
      if (event.stream === "stdout") job.stdout += `${event.text}\n`;
      if (event.stream === "stderr") job.stderr += `${event.text}\n`;
      return;
    }
    if (event.type === "sandbox") {
      job.sandboxId = event.sandbox_id;
      appendLog(job, "modal", `Sandbox created: ${event.sandbox_id}`);
      return;
    }
    if (event.type === "result") {
      job.exitCode = event.exit_code;
      job.stdout = event.stdout;
      job.stderr = event.stderr;
      job.durationMs = event.duration_ms;
      job.status = event.exit_code === 0 ? "success" : "failed";
      appendLog(job, "modal", `Finished with exit code ${event.exit_code}.`);
      return;
    }
    if (event.type === "error") {
      failJob(job, event.message);
      if (event.traceback) appendLog(job, "runner", event.traceback);
      return;
    }
  } catch {
    appendLog(job, "runner", line);
  }
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
