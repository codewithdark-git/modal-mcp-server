import type { GpuType } from "./types.js";

// Export these constants so users can see what's being excluded by default
export const DEFAULT_EXCLUDE_PATTERNS = [
  ".git/**",
  ".venv/**",
  "venv/**",
  "env/**",
  "node_modules/**",
  "dist/**",
  "build/**",
  "__pycache__/**",
  ".pytest_cache/**",
  ".mypy_cache/**",
  ".ruff_cache/**",
  ".tox/**",
  "htmlcov/**",
  ".DS_Store",
  "*.pyc",
  "*.pyo",
  "*.pyd",
  "*.egg-info/**",
  ".ipynb_checkpoints/**",
  "*.swp",
  "*.swo",
  ".vscode/**",
  ".idea/**",
  ".gitignore",
  ".gitmodules",
] as const;

export type DefaultExcludePattern = (typeof DEFAULT_EXCLUDE_PATTERNS)[number];

export const DEFAULT_GPU = readEnv("MODAL_MCP_DEFAULT_GPU", "T4") as GpuType;
export const DEFAULT_PYTHON_VERSION = readEnv("MODAL_MCP_PYTHON_VERSION", "3.11");
export const DEFAULT_TEST_TIMEOUT_SECONDS = readIntEnv("MODAL_MCP_TEST_TIMEOUT_SECONDS", 300);
export const DEFAULT_SCRIPT_TIMEOUT_SECONDS = readIntEnv("MODAL_MCP_SCRIPT_TIMEOUT_SECONDS", 300);
export const DEFAULT_TRAINING_TIMEOUT_SECONDS = readIntEnv("MODAL_MCP_TRAINING_TIMEOUT_SECONDS", 86_400);
export const DEFAULT_MAX_UPLOAD_MB = readIntEnv("MODAL_MCP_MAX_UPLOAD_MB", 512);
export const DEFAULT_APP_NAME = readEnv("MODAL_MCP_APP_NAME", "modal-mcp-server");
export const DEFAULT_CONCURRENCY_LIMIT = readIntEnv("MODAL_MCP_CONCURRENCY_LIMIT", 10);
export const DEFAULT_RETRY_ATTEMPTS = readIntEnv("MODAL_MCP_RETRY_ATTEMPTS", 3);
export const DEFAULT_RETRY_DELAY_MS = readIntEnv("MODAL_MCP_RETRY_DELAY_MS", 1000);

function readEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
