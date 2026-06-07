import { spawn } from "node:child_process";

export interface PythonCommand {
  command: string;
  args: string[];
  version: string;
}

export async function findPython(override?: string): Promise<PythonCommand> {
  const configured = override?.trim() || process.env.MODAL_MCP_PYTHON?.trim();
  const candidates: Array<[string, string]> = configured
    ? [splitCommand(configured)]
    : process.platform === "win32"
      ? [["py", ""], ["py", "-3"], ["python", ""], ["python3", ""]]
      : [["python3", ""], ["python", ""]];

  for (const [command, argString] of candidates) {
    const args = argString ? argString.split(" ").filter(Boolean) : [];
    const version = await probePython(command, args);
    if (version) return { command, args, version };
  }

  throw new Error(
    "Python was not found. Install Python 3.9+ and Modal with `python -m pip install modal`, or set MODAL_MCP_PYTHON to your Python launcher, for example `py` on Windows."
  );
}

export async function checkPythonEnvironment(options: { python?: string } = {}): Promise<{
  ok: boolean;
  python?: PythonCommand;
  modalVersion?: string;
  errors: string[];
}> {
  const errors: string[] = [];
  try {
    const python = await findPython(options.python);
    const modalVersion = await runPythonSnippet(python, "import modal; print(getattr(modal, '__version__', 'unknown'))");
    return { ok: true, python, modalVersion: modalVersion.trim(), errors };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { ok: false, errors };
  }
}

function splitCommand(commandLine: string): [string, string] {
  const [command, ...args] = commandLine.split(" ").filter(Boolean);
  return [command ?? "python", args.join(" ")];
}

function probePython(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    let child;
    try {
      child = spawn(command, [...args, "--version"], { windowsHide: true });
    } catch {
      resolve(null);
      return;
    }
    let output = "";
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve(null);
      }
    }, 3_000);
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(code === 0 ? output.trim() : null);
      }
    });
  });
}

function runPythonSnippet(python: PythonCommand, snippet: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(python.command, [...python.args, "-c", snippet], { windowsHide: true });
    } catch (error) {
      reject(error);
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(new Error("Python started but did not respond within 10 seconds."));
      }
    }, 10_000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr.trim() || `Python exited with code ${code}.`));
      }
    });
  });
}
