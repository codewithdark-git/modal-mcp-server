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

Windows CMD:
```cmd
set MODAL_TOKEN_ID=ak-your-token-id
set MODAL_TOKEN_SECRET=as-your-token-secret
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

## Usage Modes

`modal-mcp-server` supports two usage modes:

### 1. MCP Server Mode (Default)

This is the primary mode for use with AI agents like Claude Desktop, Cursor, or Codex.

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

### 2. Direct CLI Mode

You can also use `modal-mcp-server` directly from the command line without an MCP client:

```bash
# Run tests
modal-mcp-server run-tests --project-path /absolute/path/to/project --test-command "pytest tests/ -v"

# Run training job in background
modal-mcp-server run-training-job --project-path /path/to/project --train-command "python train.py" --wait false

# Run a Python script
modal-mcp-server run-function --project-path /path/to/project --script-path src/benchmark.py --function-args "--model bert-base-uncased"

# List recent jobs
modal-mcp-server list-jobs

# Check job status
modal-mcp-server get-job-status --job-id job_123456789

# Stream logs
modal-mcp-server stream-logs --job-id job_123456789

# Cancel a job
modal-mcp-server cancel-job --job-id job_123456789

# Check authentication
modal-mcp-server doctor
```

## Available Tools (MCP Mode)

| Tool | Purpose |
| --- | --- |
| `modal_run_tests` | Run a test command on a Modal GPU |
| `modal_run_training_job` | Run a training or fine-tuning command |
| `modal_run_function` | Run one Python script for inference, evaluation, or benchmarking |
| `modal_get_job_status` | Poll a job |
| `modal_stream_logs` | Read buffered setup/stdout/stderr logs |
| `modal_get_job_result` | Read stdout, stderr, exit code, and duration |
| `modal_cancel_job` | Cancel a running job |
| `modal_list_jobs` | List jobs started by this server process |
| `modal_check_environment` | Check Modal Node.js SDK authentication |

## Examples

### MCP Mode Examples

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

### CLI Mode Examples

```bash
# Run tests with CPU only (no GPU)
modal-mcp-server run-tests --project-path /path/to/project --test-command "pytest" --gpu none

# Run training with specific Python version
modal-mcp-server run-training-job --project-path /path/to/project --train-command "python train.py" --python-version 3.10 --gpu A100

# Run with environment variables
modal-mcp-server run-function --project-path /path/to/project --script-path run.py --env CUDA_VISIBLE_DEVICES=0

# Run with custom exclude patterns
modal-mcp-server run-tests --project-path /path/to/project --exclude-patterns "data/**" "*.pt" "checkpoints/**"
```

## CPU-Only Execution

You can run jobs without GPU by setting `gpu: "none"`:

```json
{
  "project_path": "/path/to/project",
  "test_command": "pytest tests/ -v",
  "gpu": "none",
  "wait": true
}
```

Or in CLI mode:

```bash
modal-mcp-server run-tests --project-path /path/to/project --gpu none
```

> **Note**: Even with `gpu: "none"`, the job still runs in a Modal sandbox, but without GPU acceleration. This is useful for CPU-only tests or when GPU is not required.

## Upload Behavior

The server uploads your project into `/project` inside an ephemeral Modal sandbox. It excludes common heavy folders by default:

### Default Exclude Patterns

```
.git/**
.gitignore
.venv/**
venv/**
env/**
node_modules/**
dist/**
build/**
__pycache__/**
.pytest_cache/**
.mypy_cache/**
.ruff_cache/**
.tox/**
htmlcov/**
.DS_Store
*.pyc
*.pyo
*.pyd
*.egg-info/**
.eggs/**
*.egg
*.log
*.swp
*.swo
.vscode/**
.idea/**
.vs/**
*.iml
.env
.env.*
*.env
*.bak
*.tmp
Thumbs.db
desktop.ini
```

You can add additional patterns:

```json
{
  "exclude_patterns": ["data/**", "checkpoints/**", "*.pt"]
}
```

### Exclude Pattern Syntax

- `**/` - Recursive directory matching (e.g., `**/node_modules/**`)
- `*` - Single path component wildcard (e.g., `*.log`)
- `?` - Single character wildcard (e.g., `test?.py`)
- `[abc]` - Character class matching (e.g., `[abc]test.py`)
- `/` - Directory separator

> **Note**: On Windows, pattern matching is case-insensitive to match the filesystem behavior.

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

### Supported GPU Values

```text
none, any, T4, L4, A10, L40S, A100, A100-40GB, A100-80GB, RTX-PRO-6000, H100, H100!, H200, B200, B200+
```

Use `none` for CPU-only execution, or `any` to let Modal choose an available GPU.

## Progress and Logging

### Upload Progress

For large projects, the server now shows upload progress:

```
[modal] Uploading 4157 files (65.5 MiB) to sandbox sb_123456789
[modal] Upload progress: 100/4157 files (2%) - /project/src/module1.py
[modal] Upload progress: 200/4157 files (4%) - /project/src/module2.py
...
[modal] Upload complete: 4157 files uploaded
```

### Job Logging

All job activity is logged and can be retrieved using:
- `modal_stream_logs` tool (MCP mode)
- `modal-mcp-server stream-logs --job-id <id>` (CLI mode)

Logs include:
- Sandbox creation and termination
- File upload progress
- Package installation output
- Command execution stdout/stderr
- Error messages with troubleshooting suggestions

## Error Handling and Retries

The server now includes automatic retry logic for transient failures:

- **Network errors**: Retried with exponential backoff (1s, 2s, 4s)
- **Rate limiting**: Automatically retried
- **Service unavailable**: Retried up to 3 times

### Enhanced Error Messages

Errors now include:
- Original error message and stack trace
- Context about what operation failed
- Troubleshooting suggestions based on error type

Example error output:

```
Modal job failed: Sandbox creation failed: GPU type 'H100' not available in your account

Troubleshooting: Try a different GPU type or use 'any' for automatic selection.
```

## Windows Support

### ESM Import Workaround

On Windows, when importing modules directly (not recommended for most users), use `pathToFileURL`:

```javascript
import { pathToFileURL } from "node:url";
const modalServicePath = pathToFileURL("C:/path/to/modal-mcp-server/dist/services/modal.js").href;
const { executeModalJob } = await import(modalServicePath);
```

### PowerShell Usage

The package includes a PowerShell wrapper script for better Windows integration:

```powershell
# Using the wrapper
modal-mcp-server.ps1 doctor
modal-mcp-server.ps1 run-tests --project-path C:\path\to\project
```

### Environment Variables in Windows

Set environment variables in PowerShell:

```powershell
$env:MODAL_TOKEN_ID="ak-your-token-id"
$env:MODAL_TOKEN_SECRET="as-your-token-secret"
```

Or in CMD:

```cmd
set MODAL_TOKEN_ID=ak-your-token-id
set MODAL_TOKEN_SECRET=as-your-token-secret
```

## Troubleshooting

### Authentication Issues

If `doctor` says authentication failed:

1. **Check environment variables**: Ensure `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` are set correctly
2. **Check config file**: Ensure `~/.modal.toml` exists with correct tokens
3. **Get new tokens**: Visit https://modal.com/tokens to generate new tokens
4. **Check token permissions**: Ensure tokens have the necessary permissions
5. **Verify Node.js SDK**: Run `modal-mcp-server doctor` to test authentication

### Node.js Version Issues

If you get Node.js version errors:

```bash
# Check your Node.js version
node --version

# Should be 20 or newer
# If not, upgrade Node.js from https://nodejs.org/
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

1. Check available GPUs in your Modal account at https://modal.com
2. Use `any` to let Modal choose an available GPU
3. Or specify a different GPU from the supported list
4. Use `none` for CPU-only execution

### Upload Performance Issues

For large projects (thousands of files):

1. **Increase exclude patterns**: Exclude unnecessary directories
2. **Increase upload limit**: Set `max_upload_mb` higher
3. **Use faster storage**: Ensure your project is on fast storage (SSD)
4. **Check network**: Ensure good internet connectivity to Modal

The server uploads files in batches of 10 concurrently and shows progress every 100 files.

### MCP Client Configuration Issues

If your agent doesn't show Modal tools:

1. **Restart the agent**: After adding the MCP server, restart your AI client
2. **Check configuration**: Ensure the MCP server configuration is correct
3. **Verify authentication**: Run `modal-mcp-server doctor` to check authentication
4. **Check logs**: Look for errors in the agent's logs
5. **Test manually**: Try running a simple job using the CLI mode first

### Windows-Specific Issues

1. **Path format**: Always use absolute paths with forward slashes or escaped backslashes
2. **ESM imports**: Use `pathToFileURL` for direct imports
3. **PowerShell vs CMD**: Use the appropriate syntax for your shell
4. **File permissions**: Ensure Node.js has permission to access your project files

## Best Practices

### For Large Projects

1. **Exclude unnecessary files**: Use `exclude_patterns` to skip large datasets, checkpoints, and generated files
2. **Use requirements.txt**: Specify dependencies in a requirements file rather than `extra_packages`
3. **Set appropriate timeouts**: Long-running jobs should have higher timeout values
4. **Monitor costs**: Modal charges for GPU usage - monitor your spending at https://modal.com

### For CI/CD Integration

Use CLI mode for CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Run tests on Modal
  run: |
    modal-mcp-server run-tests \
      --project-path ${{ github.workspace }} \
      --test-command "pytest tests/ -v" \
      --gpu T4 \
      --wait true
  env:
    MODAL_TOKEN_ID: ${{ secrets.MODAL_TOKEN_ID }}
    MODAL_TOKEN_SECRET: ${{ secrets.MODAL_TOKEN_SECRET }}
```

### For Development

1. **Use CPU for quick tests**: Use `gpu: "none"` for fast feedback during development
2. **Test with small subsets**: Use specific test files or small datasets during development
3. **Monitor logs**: Use `modal_stream_logs` to debug issues
4. **Clean up**: Cancel unnecessary jobs with `modal_cancel_job`

## Migration from Previous Versions

If you were using a previous version that required Python:

1. **Uninstall Python dependencies** (optional):
   ```bash
   pip uninstall modal
   ```

2. **Update configuration**: Remove `MODAL_MCP_PYTHON` environment variable if set

3. **Authentication**: Continue using the same `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` environment variables

4. **Verify**: Run `modal-mcp-server doctor` to check the new Node.js SDK authentication

## API Reference

### MCP Tools

All tools accept JSON input and return JSON output.

#### `modal_run_tests`

Run tests on Modal GPU.

**Input:**
```typescript
{
  project_path: string;           // Absolute path to project
  test_command?: string;          // Test command (default: "pytest")
  extra_packages?: string[];     // Additional packages to install
  requirements_file?: string;     // Path to requirements.txt
  setup_command?: string;         // Setup command to run first
  gpu?: string;                  // GPU type (default: "T4")
  timeout?: number;               // Timeout in seconds (default: 300)
  python_version?: string;        // Python version (default: "3.11")
  env?: Record<string, string>;   // Environment variables
  exclude_patterns?: string[];    // Additional exclude patterns
  max_upload_mb?: number;         // Max upload size in MB (default: 512)
  wait?: boolean;                 // Wait for completion (default: true)
}
```

**Output:**
```typescript
{
  job_id: string;
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  exit_code: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
}
```

#### `modal_run_training_job`

Run a training job on Modal GPU.

**Input:** Same as `modal_run_tests` but with:
```typescript
{
  train_command: string;          // Training command (required)
  wait?: boolean;                 // Wait for completion (default: false)
}
```

#### `modal_run_function`

Run a Python script on Modal GPU.

**Input:**
```typescript
{
  project_path: string;
  script_path: string;           // Path to Python script
  function_args?: string;        // Arguments to pass to script
  // ... other common options
}
```

#### `modal_get_job_status`

Get status of a job.

**Input:**
```typescript
{
  job_id: string;                 // Job ID (starts with "job_")
}
```

**Output:**
```typescript
{
  job_id: string;
  status: string;
  kind: string;
  gpu: string;
  started_at: string;
  completed_at?: string;
  sandbox_id?: string;
  project_path: string;
  command: string;
  exit_code?: number | null;
  duration_ms?: number | null;
  error?: string;
}
```

#### `modal_stream_logs`

Get logs for a job.

**Input:**
```typescript
{
  job_id: string;
}
```

**Output:**
```typescript
{
  job_id: string;
  status: string;
  log_lines: string[];
  line_count: number;
}
```

#### `modal_cancel_job`

Cancel a running job.

**Input:**
```typescript
{
  job_id: string;
}
```

**Output:**
```typescript
{
  job_id: string;
  cancelled: boolean;
  status: string;
}
```

#### `modal_list_jobs`

List recent jobs.

**Input:**
```typescript
{
  limit?: number;                 // Max jobs to return (default: 20)
}
```

**Output:**
```typescript
{
  jobs: Array<{
    job_id: string;
    status: string;
    kind: string;
    gpu: string;
    started_at: string;
    command: string;
  }>;
  total: number;
}
```

## Support

For issues, questions, or feature requests:

1. **Check this README**: Most common issues are documented here
2. **Run diagnostics**: Use `modal-mcp-server doctor` to check your setup
3. **Check Modal status**: Visit https://status.modal.com for service updates
4. **Review logs**: Use `modal_stream_logs` to see detailed job output

## License

MIT License - see LICENSE file for details.
