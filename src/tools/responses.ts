import type { JobInfo, JobResult } from "../core/types.js";

export function jsonResponse<T extends object>(payload: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return jsonResponse({ error: message });
}

export function jobStartedResponse(job: JobInfo) {
  return jsonResponse({
    job_id: job.jobId,
    status: job.status,
    kind: job.kind,
    gpu: job.gpu,
    started_at: job.startedAt,
    command: job.command,
    message: "Job started. Use modal_get_job_status and modal_stream_logs to monitor it.",
  });
}

export function jobResultResponse(result: JobResult) {
  return jsonResponse({ ...result });
}
