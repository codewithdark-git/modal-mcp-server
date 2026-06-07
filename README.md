# modal-mcp-server

Run real GPU tests, training jobs, inference scripts, and benchmarks from any MCP-compatible AI coding agent using your own [Modal](https://modal.com) account.

## Why This Exists

AI coding agents often test ML code on a local machine without a GPU. GPU tests may be skipped, mocked, or accidentally run on CPU, so the agent can report success even though the real CUDA/PyTorch/JAX/TensorFlow path was never validated.

`modal-mcp-server` gives the agent GPU tools. It uploads your project to an ephemeral Modal sandbox, runs the command on real GPU hardware, streams logs back, and returns stdout, stderr, exit code, and status.

## Requirements

- Node.js 20 or newer
- Python 3.9 or newer
- A Modal account
- Modal's Python package installed and authenticated

## Install

```bash
npm install -g modal-mcp-server
```

Install Modal for the Python launcher you normally use.

macOS/Linux:

```bash
python3 -m pip install modal
python3 -m modal setup
```

Windows, if you use the Python launcher:

```powershell
py -m pip install modal
py -m modal setup
```

Verify the server can find Python and Modal:

```bash
modal-mcp-server doctor
```

If Python is installed but not auto-detected, pass the launcher explicitly:

```bash
modal-mcp-server doctor --python py
```

For MCP clients, set the same launcher through environment variables:

```powershell
$env:MODAL_MCP_PYTHON="py"
```

or in the MCP config:

```json
{
  "env": {
    "MODAL_MCP_PYTHON": "py"
  }
}
```

## Modal Authentication

Local setup usually only needs:

```bash
modal setup
```

or on Windows:

```powershell
py -m modal setup
```

You can also use Modal tokens:

```bash
export MODAL_TOKEN_ID=ak-...
export MODAL_TOKEN_SECRET=as-...
```

PowerShell:

```powershell
$env:MODAL_TOKEN_ID="ak-..."
$env:MODAL_TOKEN_SECRET="as-..."
```

## MCP Client Configuration

Use the global npm binary:

```json
{
  "mcpServers": {
    "modal": {
      "command": "modal-mcp-server",
      "env": {
        "MODAL_MCP_PYTHON": "py"
      }
    }
  }
}
```

If you authenticate with Modal tokens instead of `modal setup`, include them:

```json
{
  "mcpServers": {
    "modal": {
      "command": "modal-mcp-server",
      "env": {
        "MODAL_TOKEN_ID": "ak-your-token-id",
        "MODAL_TOKEN_SECRET": "as-your-token-secret",
        "MODAL_MCP_PYTHON": "py"
      }
    }
  }
}
```

On macOS/Linux you can omit `MODAL_MCP_PYTHON` if `python3` is already on PATH.

## Available Tools

| Tool | Purpose |
| --- | --- |
| `modal_check_environment` | Check Python and Modal package availability |
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
| `MODAL_MCP_PYTHON` | auto-detect | Python launcher, for example `py`, `python3`, or `/path/to/python` |
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

If `doctor` says Python was not found on Windows, run:

```powershell
py --version
modal-mcp-server doctor --python py
```

If `doctor --python py` finds Python but Modal is missing:

```powershell
py -m pip install modal
py -m modal setup
```

If your MCP client still cannot find Python, add this to its server `env`:

```json
{
  "MODAL_MCP_PYTHON": "py"
}
```

If Modal authentication fails, run `modal setup` again or provide `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`.

## Notes

Each run creates an ephemeral Modal sandbox and terminates it after the command finishes or is cancelled. Your Modal account controls billing and GPU availability.
