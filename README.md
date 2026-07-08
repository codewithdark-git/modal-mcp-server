# modal-mcp-server

![NPM Version](https://img.shields.io/npm/v/modal-mcp-server)
![NPM Downloads](https://img.shields.io/npm/dw/modal-mcp-server)
![NPM License](https://img.shields.io/npm/l/modal-mcp-server)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
[![GitHub](https://img.shields.io/badge/GitHub-codewithdark--git%2Fmodal--mcp--server-blue)](https://github.com/codewithdark-git/modal-mcp-server)

> **Run real GPU tests, training jobs, inference scripts, and benchmarks from any MCP-compatible AI coding agent using your own [Modal](https://modal.com) account.**

---

## Why This Exists

AI coding agents often test ML code on a local machine without a GPU. GPU tests may be skipped, mocked, or accidentally run on CPU — so the agent can report success even though the real CUDA/PyTorch/JAX/TensorFlow/Triton path was never validated.

**`modal-mcp-server` gives the agent GPU tools.** It uploads your project to an ephemeral Modal sandbox, runs the command on real GPU hardware, streams progress and logs back, and returns stdout, stderr, exit code, and status.

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Real GPU Hardware** | T4, L4, A10, L40S, A100, H100, H200, B200+ |
| **Progress Streaming** | Real-time upload → install → execution phases |
| **Log Streaming** | Cursor-based `modal_stream_logs` with `follow` mode |
| **Background Jobs** | Fire-and-forget with `wait=false`, poll status/logs later |
| **Volume Mounts** | Cache pip packages, datasets, checkpoints across runs |
| **No Python Required** | Uses official Modal Node.js SDK |
| **Works with Any MCP Agent** | Claude, Claude Code, Codex, Cursor, custom clients |

---

## Quick Start (3 Steps)

### 1. Install

```bash
# Global (recommended for most users)
npm install -g modal-mcp-server

# Or project-local (for teams/CI)
npm install modal-mcp-server --save-dev
```

### 2. Configure Modal Authentication

Get your tokens from [modal.com/tokens](https://modal.com/tokens), then set as environment variables:

```bash
# Unix/macOS
export MODAL_TOKEN_ID=ak-xxxxxxxx
export MODAL_TOKEN_SECRET=as-xxxxxxxxxxxxxxxxxxxxxxxx

# Windows PowerShell
$env:MODAL_TOKEN_ID="ak-xxxxxxxx"
$env:MODAL_TOKEN_SECRET="as-xxxxxxxxxxxxxxxxxxxxxxxx"
```

Or use a config file at `~/.modal.toml`:
```toml
[modal]
token_id = "ak-xxxxxxxx"
token_secret = "as-xxxxxxxxxxxxxxxxxxxxxxxx"
```

### 3. Add to Your MCP Agent

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "modal": {
      "command": "modal-mcp-server",
      "env": {
        "MODAL_TOKEN_ID": "ak-xxxxxxxx",
        "MODAL_TOKEN_SECRET": "as-xxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

**Claude Code / Cursor / Codex / Generic:**
```json
{
  "mcpServers": {
    "modal": {
      "command": "modal-mcp-server",
      "env": {
        "MODAL_TOKEN_ID": "ak-xxxxxxxx",
        "MODAL_TOKEN_SECRET": "as-xxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

**Restart your agent**, then verify:
```
modal_check_environment
# → {"ok": true, ...}
```

---

## Available MCP Tools

| Tool | Purpose |
|------|---------|
| `modal_check_environment` | Verify Modal authentication |
| `modal_run_tests` | Run test command (pytest, custom) on GPU |
| `modal_run_function` | Run Python script on GPU |
| `modal_run_training_job` | Launch training/fine-tuning (background by default) |
| `modal_get_job_status` | Poll job status |
| `modal_stream_logs` | Stream logs with cursor/follow support |
| `modal_get_job_result` | Get stdout, stderr, exit code, duration |
| `modal_cancel_job` | Cancel running job |
| `modal_list_jobs` | List recent jobs |

---

## Common Use Cases

### Run GPU Tests
```json
{
  "project_path": "/absolute/path/to/project",
  "test_command": "pytest tests/ -v",
  "gpu": "T4",
  "extra_packages": ["torch", "torchvision"],
  "wait": true
}
```

### Run Training (Background)
```json
{
  "project_path": "/absolute/path/to/project",
  "train_command": "python train.py --epochs 10",
  "requirements_file": "requirements.txt",
  "gpu": "A100",
  "wait": false,
  "volume_mounts": [{"volume_name": "checkpoints", "mount_path": "/checkpoints"}]
}
```

### Run Inference Script
```json
{
  "project_path": "/absolute/path/to/project",
  "script_path": "inference.py",
  "function_args": "--model llama-3-8b --batch 4",
  "extra_packages": ["vllm", "transformers"],
  "gpu": "H100",
  "wait": true
}
```

Then stream logs:
```json
{
  "job_id": "job_xxx",
  "follow": true,
  "cursor": 0
}
```

---

## CLI Usage (Alternative to MCP)

The package also includes a full-featured CLI:

```bash
# Auth check
modal-mcp-server doctor

# Run tests
modal-mcp-server run-tests -p /path -c "pytest" --gpu T4 --wait -e torch

# Run Python script
modal-mcp-server run-function -p /path --script train.py --gpu L4 --wait -r requirements.txt

# Run training (background)
modal-mcp-server run-training -p /path -c "python train.py" --gpu H100 --wait=false

# Job management
modal-mcp-server list-jobs
modal-mcp-server get-status -j job_xxx
modal-mcp-server logs -j job_xxx -f     # follow mode
modal-mcp-server get-result -j job_xxx
modal-mcp-server cancel-job -j job_xxx
```

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MODAL_TOKEN_ID` | — | Modal token ID (required) |
| `MODAL_TOKEN_SECRET` | — | Modal token secret (required) |
| `MODAL_CONFIG_PATH` | `~/.modal.toml` | Modal config file path |
| `MODAL_MCP_DEFAULT_GPU` | `T4` | Default GPU type |
| `MODAL_MCP_PYTHON_VERSION` | `3.11` | Python version for sandbox |
| `MODAL_MCP_TEST_TIMEOUT_SECONDS` | `300` | Test timeout |
| `MODAL_MCP_SCRIPT_TIMEOUT_SECONDS` | `300` | Script timeout |
| `MODAL_MCP_TRAINING_TIMEOUT_SECONDS` | `86400` | Training timeout |
| `MODAL_MCP_MAX_UPLOAD_MB` | `512` | Max upload (1-10240) |
| `MODAL_MCP_APP_NAME` | `modal-mcp-server` | Modal app name |
| `MODAL_MCP_CONCURRENCY_LIMIT` | `10` | Upload concurrency |

**Supported GPUs:** `none`, `any`, `T4`, `L4`, `A10`, `L40S`, `A100`, `A100-40GB`, `A100-80GB`, `RTX-PRO-6000`, `H100`, `H100!`, `H200`, `B200`, `B200+`

---

## Project Structure for GitHub Repo

```
modal-mcp-server/
├── dist/                    # Compiled output (after build)
├── src/                     # TypeScript source
│   ├── index.ts             # MCP server entry point
│   ├── cli.ts               # CLI entry point
│   ├── core/                # Core types, config, jobs
│   ├── schemas/             # Zod input schemas
│   ├── services/            # Modal SDK integration
│   ├── tools/               # MCP tool registrations
│   └── utils/               # Errors, retry logic
├── test/                    # Vitest tests
├── scripts/                 # Build/smoke scripts
├── skills/                  # Skill documentation
│   └── modal-mcp-server/
│       ├── skill.yaml      # Skill manifest
│       ├── README.md       # Full skill docs
│       ├── QUICKSTART.md   # 3-minute quickstart
│       ├── setup.sh        # Automated Unix installer
│       ├── setup.ps1       # Automated Windows installer
│       ├── config/         # Config templates
│       └── agents/         # Agent-specific configs
├── package.json
├── tsconfig.json
└── CLAUDE.md               # Development guide
```

---

## Development

```bash
# Clone
git clone https://github.com/codewithdark-git/modal-mcp-server.git
cd modal-mcp-server

# Install & build
npm install
npm run build

# Test
npm test

# Smoke test (verifies all 9 MCP tools work)
npm run smoke:mcp

# Run CLI
node dist/cli.js doctor
node dist/cli.js run-tests -p /path -c "pytest" --gpu T4 --wait
```

---

## Links

- **NPM Package:** [npmjs.com/package/modal-mcp-server](https://www.npmjs.com/package/modal-mcp-server)
- **GitHub:** [github.com/codewithdark-git/modal-mcp-server](https://github.com/codewithdark-git/modal-mcp-server)
- **Modal Docs:** [modal.com/docs](https://modal.com/docs)
- **MCP Spec:** [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Issues:** [github.com/codewithdark-git/modal-mcp-server/issues](https://github.com/codewithdark-git/modal-mcp-server/issues)

---

## License

MIT License — see [LICENSE](LICENSE) for details.