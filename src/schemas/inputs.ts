import path from "node:path";
import { z } from "zod";
import { DEFAULT_MAX_UPLOAD_MB, DEFAULT_EXCLUDE_PATTERNS } from "../core/config.js";
import { GPU_TYPES, GpuType } from "../core/types.js";

export const GpuSchema = z.enum(GPU_TYPES).describe("Modal GPU type. Use 'none' for CPU-only execution.");

export const ProjectPathSchema = z
  .string()
  .min(1)
  .refine((value) => path.isAbsolute(value), "project_path must be an absolute path.")
  .describe("Absolute path to the local project directory to upload to Modal.");

const CommonRunShape = {
  project_path: ProjectPathSchema,
  extra_packages: z
    .array(z.string().min(1))
    .default([])
    .describe("Additional pip packages to install in the sandbox before running the command."),
  requirements_file: z
    .string()
    .optional()
    .describe("Optional requirements file path relative to project_path, for example requirements.txt."),
  setup_command: z
    .string()
    .optional()
    .describe("Optional shell command to run in /project before the main command."),
  gpu: GpuSchema.optional().default("T4").describe("Modal GPU type. Use 'none' for CPU-only execution."),
  timeout: z.number().int().min(10).max(86_400).optional().describe("Remote Modal sandbox timeout in seconds."),
  python_version: z
    .string()
    .regex(/^3\.\d{1,2}$/)
    .optional()
    .describe('Python version for Modal Image.debian_slim, for example "3.11".'),
  env: z
    .record(z.string())
    .default({})
    .describe("Environment variables to expose to the command inside the Modal sandbox."),
  exclude_patterns: z
    .array(z.string().min(1))
    .default([])
    .describe("Additional gitignore-style patterns to exclude from upload. Supports **, *, and directory patterns."),
  max_upload_mb: z
    .number()
    .int()
    .min(1)
    .max(10_240)
    .default(DEFAULT_MAX_UPLOAD_MB)
    .describe("Maximum total upload size in MiB."),
  volume_mounts: z
    .array(
      z.object({
        volume_name: z.string().min(1),
        mount_path: z.string().min(1),
      })
    )
    .optional()
    .describe("Modal Volume mounts for caching (e.g., pip cache, dataset volumes)."),
  concurrency_limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max concurrent file uploads (default: 10)."),
};

export const RunTestsInputSchema = z
  .object({
    ...CommonRunShape,
    test_command: z.string().default("pytest").describe('Test command to run, for example "pytest tests/ -v".'),
    wait: z.boolean().default(true).describe("Wait for completion before returning the tool result."),
  })
  .strict();

export const RunTrainingJobInputSchema = z
  .object({
    ...CommonRunShape,
    train_command: z.string().min(1).describe('Training command, for example "python train.py --epochs 3".'),
    timeout: z.number().int().min(60).max(86_400).optional(),
    wait: z.boolean().default(false).describe("Training defaults to background mode; set true to block until done."),
  })
  .strict();

export const RunFunctionInputSchema = z
  .object({
    ...CommonRunShape,
    script_path: z.string().min(1).describe("Python script path relative to project_path."),
    function_args: z.string().optional().describe("Arguments to pass to the Python script."),
    wait: z.boolean().default(true).describe("Wait for completion before returning the tool result."),
  })
  .strict();

export const JobIdInputSchema = z
  .object({
    job_id: z.string().startsWith("job_"),
    follow: z.boolean().default(false).describe("If true, wait for new logs and return them (long-polling style)."),
    cursor: z.number().int().min(0).optional().describe("Log line index to start from. If omitted, returns all logs."),
  })
  .strict();

export const ListJobsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict();

export type RunTestsInput = z.infer<typeof RunTestsInputSchema>;
export type RunTrainingJobInput = z.infer<typeof RunTrainingJobInputSchema>;
export type RunFunctionInput = z.infer<typeof RunFunctionInputSchema>;