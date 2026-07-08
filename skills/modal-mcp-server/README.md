# modal-mcp-server Skill

> **Run GPU-dependent Python workloads on Modal.com from any AI agent**

This skill provides comprehensive guidance for installing, configuring, and using the **modal-mcp-server** — an MCP (Model Context Protocol) server that lets AI agents execute PyTorch, JAX, TensorFlow, Triton, CUDA, and other GPU-accelerated Python code on Modal.com using your own Modal account.

**Package:** [`modal-mcp-server`](https://www.npmjs.com/package/modal-mcp-server)  
**GitHub:** [codewithdark-git/modal-mcp-server](https://github.com/codewithdark-git/modal-mcp-server)  
**Version:** 2.0.0+

---

## 📋 Table of Contents

1. [When to Use](#when-to-use)
2. [Prerequisites](#prerequisites)
3. [Step-by-Step Setup](#step-by-step-setup)
4. [Agent Configuration](#agent-configuration)
5. [Permanent vs. Project Installation](#permanent-vs-project-installation)
6. [Troubleshooting](#troubleshooting)
7. [Advanced Configuration](#advanced-configuration)
8. [Security](#security)
9. [Updating & Uninstalling](#updating--uninstalling)
10. [Quick Reference](#quick-reference)
11. [Verification Checklist](#verification-checklist)

---

## 1. When to Use

**Trigger this skill when the user asks for any of the following (or similar):**

| # | Trigger Phrase | Example |
|---|----------------|---------|
| 1 | "Run my PyTorch training on GPU" | "Train this model on an H100" |
| 2 | "Execute CUDA / Triton code remotely" | "Run this CUDA kernel on Modal" |
| 3 | "Test GPU code with pytest" | "Run my GPU tests on Modal" |
| 4 | "Run JAX / TensorFlow on GPU" | "Execute this JAX training loop" |
| 5 | "Fine-tune a model on Modal" | "Fine-tune Llama-3 on 8xH100" |
| 6 | "Run inference on GPU" | "Run vLLM inference on A100" |
| 7 | "Benchmark GPU performance" | "Benchmark matmul on H100 vs A100" |
| 8 | "Train with PyTorch Lightning / DeepSpeed" | "Run DeepSpeed training on Modal" |
| 9 | "Execute Python script with GPU deps" | "Run this script that needs torch + cuda" |
| 10 | "Distributed training across GPUs" | "Run multi-GPU training with NCCL" |
| 11 | "GPU memory debugging / profiling" | "Profile memory on A100 80GB" |
| 12 | "Run training in background, poll logs" | "Start training, I'll check logs later" |

**Key capabilities this unlocks:**
- ✅ Any GPU type: T4, L4, A10, L40S, A100, H100, H200, B200+
- ✅ Real-time progress streaming (upload → install → run)
- ✅ Cursor-based log streaming (`follow` mode)
- ✅ Volume mounts for pip cache, datasets, checkpoints
- ✅ Background jobs with polling (`wait=false`)
- ✅ CPU-only mode (`gpu="none"`)

---

## 2. Prerequisites

### Required (All Installations)

| Requirement | Minimum | Recommended | Notes |
|-------------|---------|-------------|-------|
| **Node.js** | 20.x | 22.x LTS | `node --version` |
| **npm** | 10.x | 10.x | Comes with Node.js |
| **Modal Account** | Free tier | Pro/Team | [modal.com](https://modal.com) |
| **Modal API Tokens** | — | — | Token ID + Secret from Modal dashboard |

### Agent-Specific Requirements

| Agent | Requirement |
|-------|-------------|
| **Claude Desktop** | macOS/Windows/Linux, MCP support enabled |
| **Claude Code** | `claude` CLI installed, `--mcp` flag support |
| **Codex** | OpenAI Codex CLI, MCP server config support |
| **Cursor** | Cursor 0.40+, MCP server configuration |
| **Generic MCP Client** | Any MCP-compatible client (stdio transport) |

### Verify Prerequisites

```bash
# Quick verification
node --version    # v20+
npm --version     # 10+
modal --version   # Optional: Modal CLI for token management
```

---

## 3. Step-by-Step Setup

### Option 1: Global Install (Recommended for Most Users)

```bash
# 1. Install globally
npm install -g modal-mcp-server

# 2. Set Modal tokens (get from https://modal.com/tokens)
export MODAL_TOKEN_ID=ak-xxxxxxxx
export MODAL_TOKEN_SECRET=as-xxxxxxxxxxxxxxxxxxxxxxxx

# 3. Verify
modal-mcp-server doctor
# → {"ok":true,"errors":[]}
```

### Option 2: Project-Local Install (Teams/CI)

```bash
# In your project root
npm install modal-mcp-server --save-dev

# Set tokens in project .env or environment
echo "MODAL_TOKEN_ID=ak-xxxxxxxx" >> .env
echo "MODAL_TOKEN_SECRET=as-xxxxxxxxxxxxxxxxxxxxxxxx" >> .env

# Run via npx
npx modal-mcp-server doctor
```

### Option 3: From Source (Contributors)

```bash
git clone https://github.com/codewithdark-git/modal-mcp-server.git
cd modal-mcp-server
npm install
npm run build
# Then use: node dist/cli.js doctor
```

### Configure Your Agent

After installation, add the MCP server to your agent config. See [Agent Configuration](#4-agent-configuration) below.

### Test in Agent

Restart your agent and run:
```
modal_check_environment
# Should return: {"ok": true, ...}
```

### Run Your First Job

```bash
# Quick test (CLI mode)
modal-mcp-server run-tests -p /path/to/project -c "python -c 'import torch; print(torch.cuda.is_available())'" --gpu T4 --wait
```

---

## 4. Agent Configuration

### 4.1 Global Install Path

When installed via `npm install -g modal-mcp-server`, the binary is at:
- **Unix/macOS:** `$(npm root -g)/modal-mcp-server/dist/index.js` or just `modal-mcp-server` in PATH
- **Windows:** `%APPDATA%\npm\modal-mcp-server.cmd` (or `.exe` via npx)

Use `modal-mcp-server` as the command (it's in PATH after global install).

### 4.2 Claude Desktop (`claude_desktop_config.json`)

**Location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

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

**Restart Claude Desktop after editing.**

### 4.3 Claude Code (`.mcp.json` or CLI)

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

Or use CLI:
```bash
claude mcp add modal modal-mcp-server \
  -e MODAL_TOKEN_ID=ak-xxxxxxxx \
  -e MODAL_TOKEN_SECRET=as-xxxxxxxxxxxxxxxxxxxxxxxx
```

### 4.4 Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.modal]
command = "modal-mcp-server"
env = { MODAL_TOKEN_ID = "ak-xxxxxxxx", MODAL_TOKEN_SECRET = "as-xxxxxxxxxxxxxxxxxxxxxxxx" }
```

### 4.5 Cursor (`.cursor/mcp.json` or `~/.cursor/mcp.json`)

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

### 4.6 Generic MCP Client (stdio)

```json
{
  "name": "modal",
  "transport": "stdio",
  "command": "modal-mcp-server",
  "env": {
    "MODAL_TOKEN_ID": "ak-xxxxxxxx",
    "MODAL_TOKEN_SECRET": "as-xxxxxxxxxxxxxxxxxxxxxxxx"
  }
}
```

### 4.7 Project-Local (npx)

```json
{
  "mcpServers": {
    "modal": {
      "command": "npx",
      "args": ["modal-mcp-server"],
      "env": {
        "MODAL_TOKEN_ID": "ak-xxxxxxxx",
        "MODAL_TOKEN_SECRET": "as-xxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

---

## 5. Permanent vs. Project Installation

### 5.1 Project-Local (Recommended for Teams)

```bash
# In your project root
npm install modal-mcp-server --save-dev
```

# .mcp.json in project root
```json
{
  "mcpServers": {
    "modal": {
      "command": "npx",
      "args": ["modal-mcp-server"],
      "env": {
        "MODAL_TOKEN_ID": "${MODAL_TOKEN_ID}",
        "MODAL_TOKEN_SECRET": "${MODAL_TOKEN_SECRET}"
      }
    }
  }
}
```

**Pros:** Version-locked, team-shared, CI-friendly  
**Cons:** Per-project setup

### 5.2 Global Permanent (User-Level)

```bash
npm install -g modal-mcp-server

# Add to agent config with "modal-mcp-server" command
```

**Pros:** Single install, all projects  
**Cons:** Version conflicts across projects

### 5.3 Auto-Start on Boot (Background Daemon)

#### Linux (systemd)

```ini
# /etc/systemd/system/modal-mcp-server.service
[Unit]
Description=Modal MCP Server
After=network.target

[Service]
Type=simple
User=youruser
ExecStart=/usr/bin/modal-mcp-server
Environment=MODAL_TOKEN_ID=ak-xxxxxxxx
Environment=MODAL_TOKEN_SECRET=as-xxxxxxxxxxxxxxxxxxxxxxxx
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable modal-mcp-server
sudo systemctl start modal-mcp-server
```

#### macOS (LaunchAgents)

```xml
<!-- ~/Library/LaunchAgents/com.modal.mcp.server.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.modal.mcp.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/modal-mcp-server</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>MODAL_TOKEN_ID</key><string>ak-xxxxxxxx</string>
    <key>MODAL_TOKEN_SECRET</key><string>as-xxxxxxxxxxxxxxxxxxxxxxxx</string>
  </dict>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.modal.mcp.server.plist
```

#### Windows (Task Scheduler)

```powershell
# Create scheduled task running at logon
$action = New-ScheduledTaskAction -Execute "modal-mcp-server"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "ModalMCPServer" -Action $action -Trigger $trigger -Settings $settings -User "SYSTEM" -RunLevel Highest
```

---

## 6. Troubleshooting

### 6.1 Common Issues

| # | Issue | Symptoms | Fix |
|---|-------|----------|-----|
| 1 | **Auth Failed** | `{"ok":false,"errors":["Authentication failed"]}` | Verify `MODAL_TOKEN_ID`/`MODAL_TOKEN_SECRET`; run `modal token new` |
| 2 | **GPU Quota Exceeded** | `GPU_UNAVAILABLE` or `QUOTA_EXCEEDED` | Request quota increase at modal.com; try smaller GPU (T4/L4) |
| 3 | **Upload Too Large** | `Upload is larger than configured max_upload_mb` | Increase `max_upload_mb` (max 10240); add exclude patterns |
| 4 | **Timeout** | Job times out at 300s (tests) / 86400s (training) | Increase `timeout` parameter; use `wait=false` for long jobs |
| 5 | **ESM Import Error** (Windows) | `ERR_UNKNOWN_FILE_EXTENSION` or `__dirname` errors | Use `node --experimental-vm-modules` or upgrade Node ≥20.6 |
| 6 | **Module Not Found** | `ModuleNotFoundError: No module named 'torch'` | Add `-e torch` or `-r requirements.txt`; check package names |
| 7 | **Logs Not Streaming** | `modal_stream_logs` returns empty | Use `follow=true` + `cursor` for incremental; check job status first |
| 8 | **Sandbox Creation Failed** | `Sandbox creation failed` / network errors | Check Modal status page; retry with backoff; verify internet access |

### 6.2 Debugging Commands

```bash
# Verbose doctor check
MODAL_DEBUG=1 modal-mcp-server doctor

# Test with minimal project
modal-mcp-server run-tests -p /tmp -c "python -c 'print(1+1)'" --gpu none --wait

# Check job details
modal-mcp-server get-status -j job_xxx
modal-mcp-server logs -j job_xxx -f
modal-mcp-server get-result -j job_xxx

# View all jobs
modal-mcp-server list-jobs -l 10

# Cancel stuck job
modal-mcp-server cancel-job -j job_xxx
```

### 6.3 Enable Debug Logging

```bash
# CLI
DEBUG=modal* modal-mcp-server run-tests -p /path -c "pytest" --wait

# MCP Server (add to env)
DEBUG=modal* modal-mcp-server
```

### 6.4 Platform-Specific

**Windows ESM Issues:**
```bash
# Upgrade to Node 22+ (has stable ESM)
# Or use npx which handles it
npx modal-mcp-server doctor
```

**macOS Gatekeeper:**
```bash
# If node binary blocked
xattr -d com.apple.quarantine $(which modal-mcp-server)
```

---

## 7. Advanced Configuration

### 7.1 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MODAL_TOKEN_ID` | — | Modal token ID (required) |
| `MODAL_TOKEN_SECRET` | — | Modal token secret (required) |
| `MODAL_CONFIG_PATH` | `~/.modal.toml` | Modal config file path |
| `MODAL_MCP_DEFAULT_GPU` | `T4` | Default GPU type |
| `MODAL_MCP_PYTHON_VERSION` | `3.11` | Python version |
| `MODAL_MCP_TEST_TIMEOUT_SECONDS` | `300` | Test timeout |
| `MODAL_MCP_SCRIPT_TIMEOUT_SECONDS` | `300` | Script timeout |
| `MODAL_MCP_TRAINING_TIMEOUT_SECONDS` | `86400` | Training timeout |
| `MODAL_MCP_MAX_UPLOAD_MB` | `512` | Max upload (1-10240) |
| `MODAL_MCP_APP_NAME` | `modal-mcp-server` | Modal app name |
| `MODAL_MCP_CONCURRENCY_LIMIT` | `10` | Upload concurrency |
| `MODAL_MCP_RETRY_ATTEMPTS` | `3` | API retry attempts |
| `MODAL_MCP_RETRY_DELAY_MS` | `1000` | Base retry delay |

### 7.2 Multiple Modal Accounts

```json
// .mcp.json with multiple servers
{
  "mcpServers": {
    "modal-personal": {
      "command": "modal-mcp-server",
      "env": { "MODAL_TOKEN_ID": "ak-personal", "MODAL_TOKEN_SECRET": "as-personal" }
    },
    "modal-work": {
      "command": "modal-mcp-server",
      "env": { "MODAL_TOKEN_ID": "ak-work", "MODAL_TOKEN_SECRET": "as-work" }
    }
  }
}
```

### 7.3 Volume Mounts (Caching)

```bash
# CLI
modal-mcp-server run-training -p /path -c "python train.py" \
  --volume-mount "pip-cache:/root/.cache/pip" \
  --volume-mount "dataset:/data" \
  --wait
```

```json
// MCP tool call
{
  "volume_mounts": [
    {"volume_name": "pip-cache", "mount_path": "/root/.cache/pip"},
    {"volume_name": "my-dataset", "mount_path": "/data"}
  ]
}
```

**Create volumes first:**
```bash
modal volume create pip-cache
modal volume create my-dataset
```

### 7.4 Proxy / Corporate Network

```bash
# HTTP/HTTPS proxy
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1,modal.com

# For Modal CLI too
modal config set proxy http://proxy.company.com:8080
```

### 7.5 Custom Exclude Patterns

```bash
modal-mcp-server run-tests -p /path \
  --exclude-patterns "*.ipynb" "data/**" "models/**" "*.parquet" \
  --wait
```

---

## 8. Security

### 8.1 Token Management

- **Never commit tokens** to git — use `.env` (gitignored) or environment variables
- **Rotate tokens periodically** — Modal dashboard → Settings → API Tokens
- **Use least-privilege tokens** — Create tokens with minimal required scopes
- **Separate tokens per project/environment** — Dev/Staging/Prod isolation

### 8.2 Network Security

- Modal sandboxes run in isolated containers — no direct network access to your local machine
- Outbound internet from sandbox for pip, dataset downloads
- Volume mounts are read/write — only mount trusted volumes

### 8.3 Agent Permissions

| Permission | Required? | Purpose |
|------------|-----------|---------|
| File system read (project) | Yes | Upload code to Modal |
| Environment variables | Yes | Pass tokens securely |
| Network (outbound) | Yes | Modal API, pip, datasets |
| Process execution | Yes | Run sandbox commands |

**Principle of least privilege:** Only grant the MCP server the permissions it needs.

### 8.4 Audit Logging

```bash
# Enable audit log (if available in Modal plan)
MODAL_AUDIT_LOG=1 modal-mcp-server
```

---

## 9. Updating & Uninstalling

### 9.1 Update to Latest

```bash
# Global
npm update -g modal-mcp-server

# Project-local
cd /path/to/project
npm update modal-mcp-server

# From source
cd /path/to/modal-mcp-server
git pull origin main
npm install
npm run build
```

### 9.2 Check Version

```bash
modal-mcp-server --version
# or
npm list modal-mcp-server
```

### 9.3 Uninstall

```bash
# Global
npm uninstall -g modal-mcp-server

# Project-local
npm uninstall modal-mcp-server

# Remove agent configs
# - Delete from claude_desktop_config.json
# - Delete from .mcp.json
# - Remove from Cursor/Codex configs

# Remove auto-start
# Linux: sudo systemctl disable modal-mcp-server && sudo rm /etc/systemd/system/modal-mcp-server.service
# macOS: launchctl unload ~/Library/LaunchAgents/com.modal.mcp.server.plist
# Windows: Unregister-ScheduledTask -TaskName "ModalMCPServer"
```

### 9.4 Clean Build Artifacts (Source Install Only)

```bash
# In repo
rm -rf dist node_modules package-lock.json
npm install && npm run build
```

---

## 10. Quick Reference

### CLI Commands

```bash
# Doctor / Auth check
modal-mcp-server doctor

# Run tests
modal-mcp-server run-tests -p /path -c "pytest" --gpu T4 --wait
modal-mcp-server run-tests -p /path -c "pytest" -e torch -r requirements.txt --gpu A100 --wait=false

# Run Python script
modal-mcp-server run-function -p /path --script train.py --gpu L4 --wait
modal-mcp-server run-function -p /path --script inference.py --args "--batch 32" -e vllm --gpu H100 --wait

# Run training (background by default)
modal-mcp-server run-training -p /path -c "python train.py --epochs 10" --gpu H100 --wait=false
modal-mcp-server run-training -p /path -c "python train.py" --volume-mount "cache:/root/.cache" --wait

# Job management
modal-mcp-server list-jobs -l 20
modal-mcp-server get-status -j job_xxx
modal-mcp-server logs -j job_xxx -f        # follow mode
modal-mcp-server logs -j job_xxx -c 50     # cursor at line 50
modal-mcp-server get-result -j job_xxx
modal-mcp-server cancel-job -j job_xxx

# Help
modal-mcp-server --help
modal-mcp-server run-tests --help
```

### MCP Tool Calls (Agent Usage)

```json
// modal_run_tests
{
  "project_path": "/absolute/path/to/project",
  "test_command": "pytest tests/ -v",
  "gpu": "T4",
  "wait": true,
  "extra_packages": ["torch", "torchvision"]
}

// modal_run_function
{
  "project_path": "/absolute/path/to/project",
  "script_path": "train.py",
  "function_args": "--epochs 5",
  "gpu": "A100",
  "wait": true,
  "requirements_file": "requirements.txt"
}

// modal_run_training_job
{
  "project_path": "/absolute/path/to/project",
  "train_command": "python train.py --epochs 10",
  "gpu": "H100",
  "wait": false,
  "volume_mounts": [{"volume_name": "checkpoints", "mount_path": "/checkpoints"}]
}

// modal_stream_logs
{
  "job_id": "job_xxx",
  "follow": true,
  "cursor": 0
}

// modal_get_job_status / modal_get_job_result / modal_cancel_job / modal_list_jobs
{
  "job_id": "job_xxx"
}
// or
{
  "limit": 20
}
```

### GPU Types Quick Reference

| GPU | VRAM | Best For |
|-----|------|----------|
| T4 | 16GB | Testing, small models, CI |
| L4 | 24GB | Inference, medium training |
| A10 | 24GB | Training, inference |
| L40S | 48GB | Large model training |
| A100 | 40/80GB | Heavy training, LLM fine-tune |
| H100 | 80GB | Largest models, maximum speed |
| H200 | 141GB | Memory-intensive workloads |
| B200+ | 192GB+ | Next-gen, maximum performance |
| none | — | CPU-only, debugging |

---

## 11. Verification Checklist

Run through all 10 steps to verify installation:

| Step | Command / Action | Expected Result |
|------|------------------|-----------------|
| 1 | `node --version` | v20+ |
| 2 | `npm --version` | 10+ |
| 3 | `npm install -g modal-mcp-server` | Installed successfully |
| 4 | `export MODAL_TOKEN_ID=... && export MODAL_TOKEN_SECRET=...` | Tokens set |
| 5 | `modal-mcp-server doctor` | `{"ok":true,"errors":[]}` |
| 6 | Add MCP config to agent | Agent shows 9 tools |
| 7 | `modal_check_environment` in agent | Returns `ok: true` |
| 8 | Run test job: `modal_run_tests` with GPU | Job succeeds |
| 9 | Check output shows CUDA available | `torch.cuda.is_available()` = True |
| 10 | Try training job with `wait=false` | Returns job_id, stream logs works |

**All 10 ✅ = Ready for production use!**

---

## 📚 Additional Resources

- **NPM:** https://www.npmjs.com/package/modal-mcp-server
- **GitHub:** https://github.com/codewithdark-git/modal-mcp-server
- **Modal Docs:** https://modal.com/docs
- **MCP Spec:** https://modelcontextprotocol.io
- **Issues:** https://github.com/codewithdark-git/modal-mcp-server/issues

---

*Skill version 2.0.0 — Compatible with modal-mcp-server v2.0.0+*