export const GPU_TYPES = [
  "none",
  "any",
  "T4",
  "L4",
  "A10",
  "L40S",
  "A100",
  "A100-40GB",
  "A100-80GB",
  "RTX-PRO-6000",
  "H100",
  "H100!",
  "H200",
  "B200",
  "B200+",
] as const;

export type GpuType = (typeof GPU_TYPES)[number];

export type JobStatus = "pending" | "running" | "success" | "failed" | "cancelled";

export type JobKind = "tests" | "training" | "script";

export interface ModalRunConfig {
  projectPath: string;
  command: string;
  kind: JobKind;
  extraPackages: string[];
  gpu: GpuType;
  timeoutSeconds: number;
  pythonVersion: string;
  requirementsFile?: string;
  setupCommand?: string;
  env: Record<string, string>;
  excludePatterns: string[];
  maxUploadMb: number;
  concurrencyLimit?: number;
  volumeMounts?: VolumeMount[];
}

export interface VolumeMount {
  volumeName: string;
  mountPath: string;
}

export interface JobResult {
  job_id: string;
  status: JobStatus;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

export interface JobInfo {
  jobId: string;
  status: JobStatus;
  kind: JobKind;
  startedAt: string;
  completedAt?: string;
  projectPath: string;
  command: string;
  gpu: GpuType;
  timeoutSeconds: number;
  sandboxId?: string;
  exitCode?: number | null;
  durationMs?: number;
  error?: string;
  stdout: string;
  stderr: string;
  logs: string[];
}

export interface StartedJob {
  job: JobInfo;
  done: Promise<JobInfo>;
  cancel: () => void;
}

// Progress tracking types
export type JobProgressPhase = "collecting" | "uploading" | "installing" | "running" | "complete" | "error";

export interface JobProgress {
  phase: JobProgressPhase;
  completed: number;
  total: number;
  currentFile?: string;
  message?: string;
}

export interface UploadProgress {
  filesCompleted: number;
  filesTotal: number;
  bytesCompleted: number;
  bytesTotal: number;
  currentFile?: string;
}

export type ProgressCallback = (progress: JobProgress) => void;

export interface ModalRunConfigWithProgress extends ModalRunConfig {
  onProgress?: ProgressCallback;
}