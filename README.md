# modal-mcp-server
![NPM Version](https://img.shields.io/npm/v/modal-mcp-server)
![NPM Downloads](https://img.shields.io/npm/dw/modal-mcp-server)
[![Socket Badge](https://badge.socket.dev/npm/package/modal-mcp-server/0.2.0)](https://badge.socket.dev/npm/package/modal-mcp-server/0.2.0)
![NPM License](https://img.shields.io/npm/l/modal-mcp-server)


Run real GPU tests, training jobs, inference scripts, and benchmarks from any MCP-compatible AI coding agent using your own [Modal](https://modal.com) account.

## Why This Exists

AI coding agents often test ML code on a local machine without a GPU. GPU tests may be skipped, mocked, or accidentally run on CPU, so the agent can report success even though the real CUDA/PyTorch/JAX/TensorFlow path was never validated.

`modal-mcp-server` gives the agent GPU tools. It uploads your project to an ephemeral Modal sandbox, runs the command on real GPU hardware, streams logs back, and returns stdout, stderr, exit code, and status.

## Requirements

- **Node.js 20 or newer**
- A Modal account
- Modal authentication (via environment variables or config file)

> **Note**: Python is no longer required! The server now uses the official Modal Node.js SDK.

## Install

```bash
npm install -g modal-mcp-server
```

## Modal Authentication

The server uses the Modal Node.js SDK which supports the same authentication methods as the Python SDK.

### Option 1: Environment Variables (Recommended)

Set these environment variables with your Modal tokens:

```bash
export MODAL_TOKEN_ID=ak-your-token-id
export MODAL_TOKEN_SECRET=as-your-token-secret
```

PowerShell:
```powershell
$env:MODAL_TOKEN_ID="ak-your-token-id"
$env:MODAL_TOKEN_SECRET="as-your-token-secret"
```

### Option 2: Modal Config File

Create a Modal config file at `~/.modal.toml`:

```toml
[modal]
token_id = "ak-your-token-id"
token_secret = "as-your-token-secret"
```

The config file path can be customized via `MODAL_CONFIG_PATH` environment variable.

### Option 3: Python Modal CLI (Legacy)

If you have the Modal Python CLI installed, you can still use:

```bash
python3 -m pip install modal
python3 -m modal setup
```

The Node.js SDK will automatically use the tokens from the Python CLI configuration.

## Verify Installation

Check that the server can authenticate with Modal:

```bash
modal-mcp-server doctor
```

This will verify that the Modal Node.js SDK is properly authenticated.

## MCP Client Configuration

Use the global npm binary:

```json
{
  "mcpServers": {
    "modal": {
      "command": "modal-mcp-server"
    }
  }
}
```

If you authenticate with Modal tokens, include them:

```json
{
  "mcpServers": {
    "modal": {
      "command": "modal-mcp-server",
      "env": {
        "MODAL_TOKEN_ID": "ak-your-token-id",
        "MODAL_TOKEN_SECRET": "as-your-token-secret"
      }
    }
  }
}
```

## Available Tools

| Tool | Purpose |
| --- | --- |
| `modal_check_environment` | Check Modal Node.js SDK authentication |
| `modal_run_tests` | Run a test command on a Modal GPU |
| `modal_run_training_job` | Run a training or fine-tuning command |
| `modal_run_function` | Run one Python script for inference, evaluation, or benchmarking |
| `modal_get_job_status` | Poll a job |
| `modal_stream_logs` | Read buffered setup/stdout/stderr logs |
| `modal_get_job_result` | Read stdout, stderr, exit code, and duration |
| `modal_cancel_job` | Cancel a running job |
| `modal_list_jobs` | List jobs started by this server process |

## Examples

Run tests on a T4 and wait for the result:

```json
{
  "project_path": "/absolute/path/to/project",
  "test_command": "pytest tests/ -v --tb=short",
  "extra_packages": ["pytest", "torch"],
  "gpu": "T4",
  "wait": true
}
```

Start a training job in the background:

```json
{
  "project_path": "/absolute/path/to/project",
  "train_command": "python train.py --epochs 3 --batch-size 16",
  "requirements_file": "requirements.txt",
  "gpu": "A100",
  "timeout": 7200,
  "wait": false
}
```

Run a benchmark script:

```json
{
  "project_path": "/absolute/path/to/project",
  "script_path": "src/benchmark.py",
  "function_args": "--model bert-base-uncased --batch-size 32",
  "extra_packages": ["torch", "transformers"],
  "gpu": "A10"
}
```

## Upload Behavior

The server uploads your project into `/project` inside an ephemeral Modal sandbox. It excludes common heavy folders by default:

- `.git`
- `.venv`, `venv`, `env`
- `node_modules`
- `dist`, `build`
- Python caches and test caches

Exclude datasets, checkpoints, or generated artifacts:

```json
{
  "exclude_patterns": ["data/**", "checkpoints/**", "*.pt"]
}
```

The default upload limit is 512 MiB. Override per call with `max_upload_mb` or globally with `MODAL_MCP_MAX_UPLOAD_MB`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `MODAL_TOKEN_ID` | - | Modal authentication token ID |
| `MODAL_TOKEN_SECRET` | - | Modal authentication token secret |
| `MODAL_CONFIG_PATH` | `~/.modal.toml` | Path to Modal config file |
| `MODAL_MCP_DEFAULT_GPU` | `T4` | Default Modal GPU |
| `MODAL_MCP_PYTHON_VERSION` | `3.11` | Python version for the Modal sandbox image |
| `MODAL_MCP_TEST_TIMEOUT_SECONDS` | `300` | Default test timeout |
| `MODAL_MCP_SCRIPT_TIMEOUT_SECONDS` | `300` | Default script timeout |
| `MODAL_MCP_TRAINING_TIMEOUT_SECONDS` | `86400` | Default training timeout |
| `MODAL_MCP_MAX_UPLOAD_MB` | `512` | Default upload limit |
| `MODAL_MCP_APP_NAME` | `modal-mcp-server` | Modal app name used for sandboxes |

Supported GPU values:

```text
any, T4, L4, A10, L40S, A100, A100-40GB, A100-80GB, RTX-PRO-6000, H100, H100!, H200, B200, B200+
```

## Troubleshooting

### Authentication Issues

If `doctor` says authentication failed:

1. **Check environment variables**: Ensure `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` are set correctly
2. **Check config file**: Ensure `~/.modal.toml` exists with correct tokens
3. **Get new tokens**: Visit https://modal.com/tokens to generate new tokens
4. **Check token permissions**: Ensure tokens have the necessary permissions

### Node.js Version Issues

If you get Node.js version errors:

```bash
# Check your Node.js version
node --version

# Should be 20 or newer
# If not, upgrade Node.js
```

The Modal Node.js SDK requires Node.js 20 or later.

### Upload Size Limit Issues

If uploads fail due to size limits:

```json
{
  "max_upload_mb": 1024,
  "exclude_patterns": ["data/**", "*.pt", "*.pth"]
}
```

Or set globally:

```bash
export MODAL_MCP_MAX_UPLOAD_MB=1024
```

### GPU Availability Issues

If a specific GPU is not available:

1. Check available GPUs in your Modal account
2. Use `any` to let Modal choose an available GPU
3. Or specify a different GPU from the supported list

## Notes

Each run creates an ephemeral Modal sandbox and terminates it after the command finishes or is cancelled. Your Modal account controls billing and GPU availability.

The server now uses the official Modal Node.js SDK, which means:
- **No Python required** on the client machine
- **Same authentication** methods as the Python SDK
- **Full TypeScript support** for better type safety
- **Modern architecture** aligned with Modal's development direction

## Migration from Previous Versions

If you were using a previous version that required Python:

1. **Uninstall Python dependencies** (optional):
   ```bash
   pip uninstall modal
   ```

2. **Update configuration**: Remove `MODAL_MCP_PYTHON` environment variable if set

3. **Authentication**: Continue using the same `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` environment variables

4. **Verify**: Run `modal-mcp-server doctor` to check the new Node.js SDK authentication
