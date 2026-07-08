# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**modal-mcp-server** is an MCP (Model Context Protocol) server that lets AI agents run GPU-dependent Python tests, training jobs, inference scripts, and benchmarks on [Modal.com](https://modal.com) using the user's own Modal account. It uses the official **Modal Node.js SDK** (`modal@^0.7.2`) — no Python required on the client machine.

## Architecture

### High-Level Flow

```
MCP Client (AI Agent) → MCP Server (this) → Modal Node.js SDK → Modal API → GPU Sandbox
                                                           ↓
                                                Upload project → Install deps → Run command → Return results
```

## Key Components

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point. Detects CLI vs MCP server mode. Registers all MCP tools. |
| `src/cli.ts` | Commander-based CLI for direct usage (`doctor`, `run-tests`, `run-training`, `run-function`, job management). **Now includes progress reporting for upload/install/execution phases.** |
| `src/core/config.ts` | Environment-driven defaults (`MODAL_MCP_*` env vars). |
| `src/core/types.ts` | TypeScript types: `GpuType`, `JobStatus`, `JobKind`, `ModalRunConfig`, `JobInfo`, `JobResult`, `StartedJob`. **Added progress types: `JobProgress`, `UploadProgress`, `ProgressCallback`, `JobProgressPhase`.** |
| `src/core/jobs.ts` | Job lifecycle: `startModalJob`, `waitForJob`, `toResult`, in-memory `jobRegistry` (Map). **Now passes progress callback through to Modal service.** |
| `src/services/modal.ts` | **Modal Node.js SDK integration** — singleton client, authentication, app/image creation, file upload, package install, command execution, retry logic. **Added progress callbacks at each phase (collecting, uploading, installing, running).** |
| `src/schemas/inputs.ts` | Zod schemas for all tool inputs with validation. |
| `src/tools/*.ts` | MCP tool registrations (each registers one tool via `server.registerTool`). |
| `src/utils/errors.ts` | `ModalError` class with error codes (`AUTH_FAILED`, `QUOTA_EXCEEDED`, `GPU_UNAVAILABLE`, etc.) and classification. |
| `src/utils/retry.ts` | Exponential backoff retry with jitter for Modal API calls. |

### Job Lifecycle

1. `startModalJob(config)` → Creates `JobInfo` (pending→running), calls `executeModalJob` via `services/modal.ts`, returns `StartedJob` with `done: Promise<JobInfo>` and `cancel()`.
2. `executeModalJob` (in `modal.ts`): Creates sandbox creation → uploads files → installs packages → runs setup → runs main command → terminates sandbox → returns `ModalJobResult`.
   - **Progress callbacks** fire at each phase: `collecting`, `uploading`, `installing`, `running`, `complete`, `error`
3. `waitForJob(started)` awaits the `done` promise.
4. Results returned via `toResult(JobInfo)` → `JobResult`.

### Upload & Exclude Patterns

- Projects upload to `/project` in the sandbox.
- Default excludes: `.git`, `.venv/venv/env`, `node_modules`, `dist/build`, Python caches, test caches.
- Custom patterns via `exclude_patterns` (gitignore-style: `**`, `*`, `?`, `[abc]`, case-insensitive on Windows).
- Size limit: `max_upload_mb` (default 512 MiB, max 10240).
- **Progress reporting**: CLI shows real-time upload progress (files uploaded, bytes transferred, current file).

## Commands

### Development

```bash
# Install dependencies
npm install

# Type-check and build
npm run build

# Run in dev mode (tsx)
npm run dev

# Run tests
npm test

# Run single test file
npx vitest run test/command.test.ts

# Type-check only
npx tsc --noEmit
```

### Running the Server

```bash
# MCP server mode (default, for AI agents)
modal-mcp-server

# Or with explicit flag
modal-mcp-server --mcp

# CLI mode
modal-mcp-server doctor                    # Check Modal authentication
modal-mcp-server run-tests -p /path/to/project
modal-mcp-server run-training -p /path/to/project -c "python train.py"
modal-mcp-server run-function -p /path/to/project --script src/script.py
modal-mcp-server list-jobs
modal-mcp-server get-status -j job_xxx
modal-mcp-server get-result -j job_xxx
modal-mcp-server logs -j job_xxx
modal-mcp-server cancel-job -j job_xxx

# CLI now shows real-time progress during upload, package install, and execution
```

### Smoke Test

```bash
# Build first, then run MCP smoke test
npm run build
npm run smoke:mcp
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MODAL_TOKEN_ID` | — | Modal token ID (required) |
| `MODAL_TOKEN_SECRET` | — | Modal token secret (required) |
| `MODAL_CONFIG_PATH` | `~/.modal.toml` | Path to Modal config file |
| `MODAL_MCP_DEFAULT_GPU` | `T4` | Default GPU type |
| `MODAL_MCP_PYTHON_VERSION` | `3.11` | Python version for sandbox image |
| `MODAL_MCP_TEST_TIMEOUT_SECONDS` | `300` | Default test timeout |
| `MODAL_MCP_SCRIPT_TIMEOUT_SECONDS` | `300` | Default script timeout |
| `MODAL_MCP_TRAINING_TIMEOUT_SECONDS` | `86400` | Default training timeout |
| `MODAL_MCP_MAX_UPLOAD_MB` | `512` | Default upload size limit |
| `MODAL_MCP_APP_NAME` | `modal-mcp-server` | Modal app name for sandboxes |

## Supported GPU Types

`none`, `any`, `T4`, `L4`, `A10`, `L40S`, `A100`, `A100-40GB`, `A100-80GB`, `RTX-PRO-6000`, `H100`, `H100!`, `H200`, `B200`, `B200+`

## MCP Tools

| Tool | Description | Wait Default |
|------|-------------|--------------|
| `modal_check_environment` | Check Modal authentication | — |
| `modal_run_tests` | Run test command on GPU | `true` |
| `modal_run_training_job` | Launch training job | `false` (background) |
| `modal_run_function` | Run Python script | `true` |
| `modal_get_job_status` | Poll job status | — |
| `modal_stream_logs` | Read buffered logs (supports `follow` and `cursor` for streaming) | — |
| `modal_get_job_result` | Get stdout/stderr/exit code | — |
| `modal_cancel_job` | Cancel running job | — |
| `modal_list_jobs` | List recent jobs | — |

## Adding a New Tool

1. Create `src/tools/new-tool.ts` with `registerNewTool(server: McpServer)`
2. Define Zod schema in `src/schemas/inputs.ts` (or inline)
3. Add `toConfig` function converting input → `ModalRunConfig`
4. Use `startModalJob`, `waitForJob`, `toResult` from `core/jobs.ts`
5. Register in `src/index.ts` MCP server block
6. Add CLI command in `src/cli.ts` if needed

## Testing

- Uses **vitest** (`npm test`)
- Test file: `test/command.test.ts` (validates Zod schemas)
- Run single test: `npx vitest run test/command.test.ts`

## Build Output

- `dist/` — Compiled JavaScript + TypeScript declarations
- `scripts/copy-assets.mjs` — No-op kept for compatibility (Python files no longer needed)

## Key Patterns

- **Configuration**: All defaults in `core/config.ts` via `readEnv`/`readIntEnv`
- **Error Handling**: `ModalError` with codes → `toModalError` classifies raw errors → remediation strings for users
- **Retry**: `withRetry` in `utils/retry.ts` with exponential backoff + jitter; retryable codes: `NETWORK_ERROR`, `TIMEOUT`, `GPU_UNAVAILABLE`, `QUOTA_EXCEEDED`
- **Job Registry**: In-memory `Map<string, StartedJob>` in `core/jobs.ts` (cleared on server restart)
- **File Exclusion**: `shouldExcludeFile` in `modal.ts` handles gitignore-style patterns
- **Progress Reporting**: `startModalJob` accepts `onProgress` callback (type `ProgressCallback` in `core/types.ts`). Fires at phases: `collecting`, `uploading`, `installing`, `running`, `complete`, `error`. CLI uses this for real-time progress output.
- **Log Streaming**: `modal_stream_logs` tool supports `follow` (boolean) and `cursor` (number) for incremental log fetching.