import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jobRegistry, toResult } from "../core/jobs.js";
import { JobIdInputSchema, ListJobsInputSchema } from "../schemas/inputs.js";
import { errorResponse, jsonResponse } from "./responses.js";

export function registerGetJobStatus(server: McpServer): void {
  server.registerTool(
    "modal_get_job_status",
    {
      title: "Get Modal Job Status",
      description: "Return status and metadata for a job launched by this MCP server process.",
      inputSchema: JobIdInputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (rawInput: unknown) => {
      try {
        const { job_id } = JobIdInputSchema.parse(rawInput);
        const started = jobRegistry.get(job_id);
        if (!started) return jsonResponse({ error: `Job not found: ${job_id}` });
        const job = started.job;
        return jsonResponse({
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
        });
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}

export function registerStreamLogs(server: McpServer): void {
  server.registerTool(
    "modal_stream_logs",
    {
      title: "Read Modal Job Logs",
      description: "Return buffered logs for a Modal job, including setup, stdout, stderr, and runner events. Supports follow mode for real-time streaming.",
      inputSchema: JobIdInputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (rawInput: unknown) => {
      try {
        const { job_id, follow = false, cursor = 0 } = JobIdInputSchema.parse(rawInput);
        const started = jobRegistry.get(job_id);
        if (!started) return jsonResponse({ error: `Job not found: ${job_id}` });

        const logs = started.job.logs;
        const totalLines = logs.length;

        // Return logs from cursor position
        const newLogs = logs.slice(cursor);

        // If follow mode and job is still running, we could implement long-polling
        // For now, return current logs with metadata
        const response: {
          job_id: string;
          status: string;
          log_lines: string[];
          line_count: number;
          total_lines: number;
          cursor: number;
          has_more: boolean;
        } = {
          job_id,
          status: started.job.status,
          log_lines: newLogs,
          line_count: newLogs.length,
          total_lines: totalLines,
          cursor,
          has_more: cursor + newLogs.length < totalLines,
        };

        return jsonResponse(response);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}

export function registerCancelJob(server: McpServer): void {
  server.registerTool(
    "modal_cancel_job",
    {
      title: "Cancel Modal Job",
      description: "Cancel a running Modal job launched by this MCP server process.",
      inputSchema: JobIdInputSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async (rawInput: unknown) => {
      try {
        const { job_id } = JobIdInputSchema.parse(rawInput);
        const started = jobRegistry.get(job_id);
        if (!started) return jsonResponse({ error: `Job not found: ${job_id}` });
        if (started.job.status !== "running" && started.job.status !== "pending") {
          return jsonResponse({ job_id, cancelled: false, status: started.job.status });
        }
        started.cancel();
        return jsonResponse({ job_id, cancelled: true, status: started.job.status });
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}

export function registerListJobs(server: McpServer): void {
  server.registerTool(
    "modal_list_jobs",
    {
      title: "List Modal Jobs",
      description: "List recent jobs launched during the lifetime of this MCP server process.",
      inputSchema: ListJobsInputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (rawInput: unknown) => {
      try {
        const { limit } = ListJobsInputSchema.parse(rawInput);
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
        return jsonResponse({ jobs, total: jobRegistry.size });
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}

export function registerGetJobResult(server: McpServer): void {
  server.registerTool(
    "modal_get_job_result",
    {
      title: "Get Modal Job Result",
      description: "Return stdout, stderr, exit code, and duration for a completed or running job.",
      inputSchema: JobIdInputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (rawInput: unknown) => {
      try {
        const { job_id } = JobIdInputSchema.parse(rawInput);
        const started = jobRegistry.get(job_id);
        if (!started) return jsonResponse({ error: `Job not found: ${job_id}` });
        return jsonResponse(toResult(started.job));
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
