#!/usr/bin/env python3
"""Runtime bridge between the TypeScript MCP server and Modal's Python API."""

from __future__ import annotations

import fnmatch
import json
import os
import posixpath
import signal
import sys
import threading
import time
import traceback
from pathlib import Path
from typing import Any


sandbox: Any | None = None


def emit(event: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def log(stream: str, text: str) -> None:
    emit({"type": "log", "stream": stream, "text": text})


def handle_signal(signum: int, _frame: Any) -> None:
    global sandbox
    log("modal", f"Received signal {signum}; terminating Modal sandbox.")
    if sandbox is not None:
        try:
            sandbox.terminate()
        except Exception as exc:  # noqa: BLE001
            log("stderr", f"Failed to terminate sandbox cleanly: {exc}")
    raise SystemExit(130)


signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)


def main() -> int:
    payload = json.loads(sys.stdin.read())
    started = time.time()

    try:
        import modal
    except Exception as exc:  # noqa: BLE001
        emit(
            {
                "type": "error",
                "message": (
                    "The Modal Python package is not installed. "
                    "Run `python -m pip install modal` and authenticate with `modal setup`."
                ),
                "traceback": str(exc),
            }
        )
        return 2

    project_path = Path(payload["projectPath"]).resolve()
    if not project_path.exists() or not project_path.is_dir():
        emit({"type": "error", "message": f"project_path is not a directory: {project_path}"})
        return 2

    files = collect_files(
        project_path,
        payload.get("excludePatterns", []),
        int(payload.get("maxUploadMb", 512)) * 1024 * 1024,
    )

    try:
        run_modal_job(modal, payload, project_path, files, started)
        return 0
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        emit({"type": "error", "message": str(exc), "traceback": traceback.format_exc()})
        return 1


def collect_files(project_path: Path, exclude_patterns: list[str], max_bytes: int) -> list[Path]:
    selected: list[Path] = []
    total = 0

    for file_path in project_path.rglob("*"):
        if not file_path.is_file():
            continue
        rel = file_path.relative_to(project_path).as_posix()
        if should_exclude(rel, exclude_patterns):
            continue
        size = file_path.stat().st_size
        total += size
        if total > max_bytes:
            raise RuntimeError(
                f"Upload is larger than the configured max_upload_mb limit "
                f"({max_bytes // (1024 * 1024)} MiB). Add exclude_patterns or raise max_upload_mb."
            )
        selected.append(file_path)

    return selected


def should_exclude(rel_path: str, patterns: list[str]) -> bool:
    parts = rel_path.split("/")
    for pattern in patterns:
        normalized = pattern.replace("\\", "/")
        if fnmatch.fnmatch(rel_path, normalized):
            return True
        if normalized.endswith("/**"):
            prefix = normalized[:-3].rstrip("/")
            if rel_path == prefix or rel_path.startswith(prefix + "/"):
                return True
        if normalized in parts:
            return True
    return False


def run_modal_job(modal: Any, payload: dict[str, Any], project_path: Path, files: list[Path], started: float) -> None:
    global sandbox

    app_name = os.environ.get("MODAL_MCP_APP_NAME", "modal-mcp-server")
    timeout = int(payload["timeoutSeconds"])
    python_version = payload["pythonVersion"]
    gpu = payload["gpu"]

    log("modal", f"Looking up Modal app `{app_name}`.")
    app = modal.App.lookup(app_name, create_if_missing=True)
    image = modal.Image.debian_slim(python_version=python_version)

    log("modal", f"Creating sandbox with gpu={gpu}, python={python_version}, timeout={timeout}s.")
    sandbox = modal.Sandbox.create(
        "sleep",
        str(timeout + 120),
        app=app,
        image=image,
        gpu=gpu,
        timeout=timeout + 120,
        idle_timeout=timeout + 120,
        env=payload.get("env") or {},
    )

    emit({"type": "sandbox", "sandbox_id": getattr(sandbox, "object_id", None) or getattr(sandbox, "sandbox_id", "unknown")})

    try:
        log("modal", f"Uploading {len(files)} project files.")
        sandbox.filesystem.make_directory("/project")
        for file_path in files:
            rel = file_path.relative_to(project_path).as_posix()
            remote_path = posixpath.join("/project", rel)
            sandbox.filesystem.copy_from_local(file_path, remote_path)
        log("modal", "Upload complete.")

        requirements_file = payload.get("requirementsFile")
        if requirements_file:
            req_rel = requirements_file.replace("\\", "/").lstrip("/")
            if ".." in req_rel.split("/"):
                raise RuntimeError("requirements_file must be relative to project_path.")
            run_command(
                f"python -m pip install --disable-pip-version-check --no-input -r {shell_quote(posixpath.join('/project', req_rel))}",
                timeout,
                "setup",
                env=payload.get("env") or {},
            )

        extra_packages = payload.get("extraPackages") or []
        if extra_packages:
            quoted = " ".join(shell_quote(pkg) for pkg in extra_packages)
            run_command(
                f"python -m pip install --disable-pip-version-check --no-input {quoted}",
                timeout,
                "setup",
                env=payload.get("env") or {},
            )

        setup_command = payload.get("setupCommand")
        if setup_command:
            run_command(setup_command, timeout, "setup", env=payload.get("env") or {})

        result = run_command(payload["command"], timeout, "command", env=payload.get("env") or {})
        duration_ms = int((time.time() - started) * 1000)
        emit(
            {
                "type": "result",
                "exit_code": result["exit_code"],
                "stdout": result["stdout"],
                "stderr": result["stderr"],
                "duration_ms": duration_ms,
            }
        )
    finally:
        if sandbox is not None:
            sandbox.terminate()
            log("modal", "Sandbox terminated.")
            sandbox = None


def run_command(command: str, timeout: int, label: str, env: dict[str, str]) -> dict[str, Any]:
    if sandbox is None:
        raise RuntimeError("Sandbox is not initialized.")

    log("modal", f"Running {label}: {command}")
    process = sandbox.exec(
        "bash",
        "-lc",
        command,
        workdir="/project",
        timeout=timeout,
        env=env,
    )

    stdout_lines: list[str] = []
    stderr_lines: list[str] = []

    stdout_thread = threading.Thread(
        target=read_stream,
        args=(process.stdout, "stdout" if label == "command" else "setup", stdout_lines),
        daemon=True,
    )
    stderr_thread = threading.Thread(
        target=read_stream,
        args=(process.stderr, "stderr", stderr_lines),
        daemon=True,
    )
    stdout_thread.start()
    stderr_thread.start()

    wait_result = process.wait()
    stdout_thread.join(timeout=2)
    stderr_thread.join(timeout=2)
    exit_code = getattr(process, "returncode", wait_result)
    if exit_code is None:
        exit_code = wait_result if isinstance(wait_result, int) else 1

    if label != "command" and exit_code != 0:
        raise RuntimeError(f"{label} command failed with exit code {exit_code}: {''.join(stderr_lines)}")

    return {
        "exit_code": exit_code,
        "stdout": "".join(stdout_lines),
        "stderr": "".join(stderr_lines),
    }


def read_stream(reader: Any, stream_name: str, sink: list[str]) -> None:
    try:
        for line in reader:
            text = str(line)
            sink.append(text)
            log(stream_name, text.rstrip("\n"))
    except Exception as exc:  # noqa: BLE001
        log("stderr", f"Failed reading {stream_name}: {exc}")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


if __name__ == "__main__":
    raise SystemExit(main())
