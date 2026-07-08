# AGENTS.md - Modal MCP Server

## Project Overview

**modal-mcp-server** - An MCP (Model Context Protocol) server for running GPU-dependent Python tests, training, inference, and benchmarks on Modal.com. Exposes tools via MCP stdio transport for use with MCP clients (Claude Desktop, Cursor, Codex, etc.).

**Key Stack:**
- TypeScript/ESM, Node.js 20+
- @modelcontextprotocol/sdk (MCP stdio transport)
- @modal-labs/sdk (Modal Node.js SDK)
- vitest for testing

---

## Commands

```bash
# Build
npm run build          # tsc -p tsconfig.build.json -> dist/

# Test
npm test               # vitest run

# Smoke test (requires Modal auth)
npm run smoke:mcp      # node scripts/smoke-mcp.mjs

# Build + Test + Smoke (pre-publish)
npm run build && npm test && npm run smoke:mcp

# Lint/Typecheck
npx tsc --noEmit       # TypeScript typecheck
```

---

## Project Structure

```
src/
├── index.ts                    # MCP server entry, registers tools
├── schemas/
│   └── inputs.ts               # Zod schemas for tool inputs
├── services/
│   ├── modal.js                # Modal sandbox: upload, execute, sandbox mgmt
│   ├── modal-auth.js           # Modal authentication
│   └── upload.ts               # File upload with exclusions
├── tools/
│   ├── doctor.ts               # modal_check_environment tool
│   ├── job-management.ts       # status, logs, result, cancel, list
│   ├── run-function.ts         # modal_run_function tool
│   ├── run-tests.ts            # modal_run_tests tool
│   └── run-training-job.ts     # modal_run_training_job tool
└── tools/types.ts              # Shared tool types

dist/                           # Compiled output (gitignored)
scripts/
├── smoke-mcp.mjs               # MCP smoke test (spawns server, calls tools)
└── postinstall.js              # Post-install helper
test/
└── command.test.ts             # Vitest input schema tests
```

---

## Architecture & Patterns

### MCP Server Entry (`src/index.ts`)
- Starts MCP stdio server via `StdioServerTransport`
- Single CLI subcommand: `doctor` (auth check)
- Registers 9 tools: `modal_check_environment`, `modal_run_tests`, `modal_run_training_job`, `modal_run_function`, `modal_get_job_status`, `modal_stream_logs`, `modal_get_job_result`, `modal_cancel_job`, `modal_list_jobs`

### Tool Registration Pattern (`src/tools/*.ts`)
Each tool file exports `registerXxx(server)` that calls `server.tool(name, schema, handler)`.
- Input validation via Zod schemas from `schemas/inputs.ts`
- Handlers delegate to `services/modal.js` for Modal operations

### Modal Service (`src/services/modal.js`)
Core service handling:
- Modal client initialization (lazy, cached)
- Python image creation (`python:3.11-slim` default)
- Sandbox creation with GPU config
- Project upload (tar streaming, batched concurrent uploads, exclude patterns)
- Command execution with `pip install -e .` + user command
- Job polling, log streaming, result retrieval
- Job tracking in memory (Map by job ID)

### Input Schemas (`src/schemas/inputs.ts`)
Zod schemas for all tool inputs. Key patterns:
- `project_path`: `z.string().refine(p => path.isAbsolute(p))` - requires absolute paths
- GPU enum: `any`, `T4`, `L4`, `A10`, `L40S`, `A100`, `A100-40GB`, `A100-80GB`, `RTX-PRO-6000`, `H100`, `H100!`, `H200`, `B200`, `B200+`
- `wait: z.boolean().default(true)` - default wait for completion

### Upload Exclusions (`src/services/upload.ts`)
Default exclusions (not user-visible, not exported):
- `.git`, `.venv`, `venv`, `env`, `node_modules`
- `dist`, `build`, `*.egg-info`, `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`
- User can add `exclude_patterns` per call

### Job Tracking
In-memory `Map<string, JobInfo>` in `modal.js` tracks jobs started by this server process. Jobs persist until server restart.

---

## Configuration (Env Vars)

| Variable | Default | Purpose |
|----------|---------|---------|
| `MODAL_TOKEN_ID` | - | Modal auth token ID |
| `MODAL_TOKEN_SECRET` | - | Modal auth token secret |
| `MODAL_CONFIG_PATH` | `~/.modal.toml` | Modal config file path |
| `MODAL_MCP_DEFAULT_GPU` | `T4` | Default GPU type |
| `MODAL_MCP_PYTHON_VERSION` | `3.11` | Python version for sandbox |
| `MODAL_MCP_TEST_TIMEOUT_SECONDS` | `300` | Test timeout |
| `MODAL_MCP_SCRIPT_TIMEOUT_SECONDS` | `300` | Script timeout |
| `MODAL_MCP_TRAINING_TIMEOUT_SECONDS` | `86400` | Training timeout |
| `MODAL_MCP_MAX_UPLOAD_MB` | `512` | Upload size limit |
| `MODAL_MCP_APP_NAME` | `modal-mcp-server` | Modal app name |

---

## Testing

```bash
npm test
# Runs vitest on test/command.test.ts (Zod schema validation)
```

Smoke test requires Modal auth and spawns actual server:
```bash
npm run smoke:mcp
```

---

## Build & Publish

```bash
npm run build        # Compiles to dist/
npm pack --dry-run   # Verify package contents
npm publish --access public
```

Requires Node.js 20+ (ESM, `package.json` has `"type": "module"`).

---

## Key Conventions

- **ESM only** - `package.json` has `"type": "module"`, use `.js` extensions in imports
- **Path aliases** - `tsconfig.json` maps `@/*` to `src/*`
- **Zod for validation** - All tool inputs validated via Zod schemas
- **No Python dependency** - Uses Modal Node.js SDK exclusively
- **In-memory job tracking** - Jobs lost on server restart (ephemeral MCP server)
- **Default GPU required** - Even CPU tests run on GPU sandbox (Modal requirement)
- **Upload excludes** - Not user-configurable defaults, only additive via `exclude_patterns`
- **No streaming logs** - `modal_stream_logs` returns buffered logs after completion, not live stream
- **No CLI subcommands** except `doctor` - Server only runs as MCP stdio transport

---

## Common Tasks

### Add a new tool
1. Add Zod schema to `src/schemas/inputs.ts`
2. Create `src/tools/new-tool.ts` with `registerNewTool(server)`
3. Import and register in `src/index.ts`

### Modify upload exclusions
Edit `DEFAULT_EXCLUDE_PATTERNS` in `src/services/upload.ts` (not user-configurable)

### Change default GPU/timeout/env
Modify defaults in `src/schemas/inputs.ts` and corresponding env var fallbacks in `src/services/modal.js`

### Add retry logic
Wrap Modal SDK calls in `src/services/modal.js` with retry/backoff (currently no retries)

### Add CLI subcommands
Extend `src/index.ts` `main()` argument parsing before MCP server startup