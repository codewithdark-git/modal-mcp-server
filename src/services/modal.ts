import { ModalClient, type Sandbox, type ContainerProcess } from "modal";
import { readdir, stat, readFile } from "node:fs/promises";
import { join, relative, posix } from "node:path";

import { pathToFileURL } from "node:url";
import {
  DEFAULT_CONCURRENCY_LIMIT,
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_RETRY_DELAY_MS,
} from "../core/config.js";

// Singleton Modal client instance
let modalClient: ModalClient | null = null;

export interface ModalConfig {
  appName: string;
  pythonVersion: string;
  gpu: string;
  timeoutSeconds: number;
}

export interface ModalJobConfig extends ModalConfig {
  projectPath: string;
  command: string;
  extraPackages: string[];
  requirementsFile?: string;
  setupCommand?: string;
  env: Record<string, string>;
  excludePatterns: string[];
  maxUploadMb: number;
  concurrencyLimit?: number;
  onProgress?: (progress: { uploaded: number; total: number; currentFile?: string }) => void;
  onLog?: (level: "info" | "warn" | "error", message: string) => void;
}

export interface ModalJobResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  sandboxId: string;
}

/**
 * Get or create the Modal client instance
 */
export function getModalClient(): ModalClient {
  if (!modalClient) {
    modalClient = new ModalClient();
  }
  return modalClient;
}

/**
 * Reset the Modal client (useful for testing)
 */
export function resetModalClient(): void {
  modalClient = null;
}

/**
 * Check if Modal authentication is available
 */
export async function checkModalAuthentication(): Promise<{
  ok: boolean;
  modalVersion?: string;
  errors: string[];
}> {
  const errors: string[] = [];
  
  try {
    const modal = getModalClient();
    // Try to get or create an app to verify authentication
    try {
      await modal.apps.fromName("modal-mcp-server", { createIfMissing: true });
      return { ok: true, errors };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      return { ok: false, errors };
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { ok: false, errors };
  }
}

/**
 * Create a Modal app, creating if it doesn't exist
 */
export async function getOrCreateApp(appName: string): Promise<any> {
  const modal = getModalClient();
  return await modal.apps.fromName(appName, { createIfMissing: true });
}

/**
 * Create a Modal image with the specified Python version
 */
export async function createPythonImage(pythonVersion: string): Promise<any> {
  const modal = getModalClient();
  // Use Modal's built-in Python image
  return modal.images.fromRegistry(`python:${pythonVersion}-slim`);
}

/**
 * Check if a file path should be excluded based on patterns
 */
function shouldExcludeFile(relPath: string, excludePatterns: string[]): boolean {
  const normalizedPath = relPath.replace(/\\/g, "/");
  
  for (const pattern of excludePatterns) {
    const normalizedPattern = pattern.replace(/\\/g, "/");
    
    // Handle ** patterns
    if (normalizedPattern.endsWith("/**")) {
      const prefix = normalizedPattern.slice(0, -3).replace(/\/+$/, "");
      if (normalizedPath === prefix || normalizedPath.startsWith(prefix + "/")) {
        return true;
      }
    }
    // Handle directory patterns
    else if (normalizedPattern.endsWith("/")) {
      const prefix = normalizedPattern.slice(0, -1);
      if (normalizedPath === prefix || normalizedPath.startsWith(prefix + "/")) {
        return true;
      }
    }
    // Handle exact file patterns
    else if (normalizedPath === normalizedPattern) {
      return true;
    }
    // Handle glob patterns (simple * matching)
    else if (normalizedPattern.includes("*")) {
      const patternParts = normalizedPattern.split("/");
      const pathParts = normalizedPath.split("/");
      
      if (patternParts.length !== pathParts.length) continue;
      
      let matches = true;
      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i] === "*") continue;
        if (patternParts[i] !== pathParts[i]) {
          matches = false;
          break;
        }
      }
      if (matches) return true;
    }
  }
  return false;
}

/**
 * Collect all files from a directory, respecting exclude patterns and size limits
 */
async function collectFiles(
  dirPath: string,
  excludePatterns: string[],
  maxBytes: number
): Promise<{ files: Array<{ localPath: string; remotePath: string; size: number }>; totalSize: number }> {
  const files: Array<{ localPath: string; remotePath: string; size: number }> = [];
  let totalSize = 0;
  
  async function walkDirectory(currentPath: string, relativePath: string = "") {
    const entries = await readdir(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      const relPath = relativePath ? join(relativePath, entry.name) : entry.name;
      
      if (entry.isDirectory()) {
        await walkDirectory(fullPath, relPath);
      } else if (entry.isFile()) {
        const fileStat = await stat(fullPath);
        const fileSize = fileStat.size;
        
        // Check if file should be excluded
        if (shouldExcludeFile(relPath, excludePatterns)) {
          continue;
        }
        
        // Check size limit
        if (totalSize + fileSize > maxBytes) {
          const maxMb = maxBytes / (1024 * 1024);
          throw new Error(
            `Upload is larger than the configured max_upload_mb limit (${maxMb.toFixed(0)} MiB). Add exclude_patterns or raise max_upload_mb.`
          );
        }
        
        files.push({
          localPath: fullPath,
          remotePath: posix.join("/project", relPath),
          size: fileSize,
        });
        totalSize += fileSize;
      }
    }
  }
  
  await walkDirectory(dirPath);
  return { files, totalSize };
}

/**
 * Upload project files to a sandbox
 */
export async function uploadProjectToSandbox(
  sandbox: Sandbox,
  projectPath: string,
  excludePatterns: string[],
  maxUploadMb: number
): Promise<void> {
  const maxBytes = maxUploadMb * 1024 * 1024;
  
  // Create the /project directory in the sandbox
  await sandbox.filesystem.makeDirectory("/project");
  
  // Collect all files to upload
  const { files, totalSize } = await collectFiles(projectPath, excludePatterns, maxBytes);
  
  if (files.length === 0) {
    console.log(`[modal] No files to upload from ${projectPath}`);
    return;
  }
  
  console.log(`[modal] Uploading ${files.length} files (${totalSize} bytes) to sandbox ${sandbox.sandboxId}`);
  
  // Upload files concurrently with a limit to avoid overwhelming the sandbox
  const CONCURRENCY_LIMIT = 10;
  const uploadPromises: Promise<void>[] = [];
  
  for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
    const batch = files.slice(i, i + CONCURRENCY_LIMIT);
    
    for (const file of batch) {
      const uploadPromise = sandbox.filesystem
        .copyFromLocal(file.localPath, file.remotePath)
        .then(() => {
          console.log(`[modal] Uploaded: ${file.remotePath}`);
        })
        .catch((error: Error) => {
          console.error(`[modal] Failed to upload ${file.localPath}: ${error.message}`);
          throw error;
        });
      
      uploadPromises.push(uploadPromise);
    }
  }
  
  // Wait for all uploads to complete
  await Promise.all(uploadPromises);
  
  console.log(`[modal] Upload complete: ${files.length} files uploaded`);
}

/**
 * Install Python packages in a sandbox
 */
export async function installPackages(
  sandbox: Sandbox,
  packages: string[],
  requirementsFile?: string,
  timeoutSeconds: number = 300
): Promise<void> {
  if (requirementsFile) {
    // Install from requirements file
    const cmd = `pip install --disable-pip-version-check --no-input -r /project/${requirementsFile}`;
    const proc = await sandbox.exec(["bash", "-lc", cmd], {
      stdout: "pipe",
      stderr: "pipe",
      timeoutMs: timeoutSeconds * 1000,
    });
    
    const exitCode = await proc.wait();
    if (exitCode !== 0) {
      const stderr = await proc.stderr.readText();
      throw new Error(`Failed to install from requirements.txt (exit code ${exitCode}): ${stderr}`);
    }
  }
  
  if (packages.length > 0) {
    // Install individual packages
    const pkgList = packages.join(" ");
    const cmd = `pip install --disable-pip-version-check --no-input ${pkgList}`;
    const proc = await sandbox.exec(["bash", "-lc", cmd], {
      stdout: "pipe",
      stderr: "pipe",
      timeoutMs: timeoutSeconds * 1000,
    });
    
    const exitCode = await proc.wait();
    if (exitCode !== 0) {
      const stderr = await proc.stderr.readText();
      throw new Error(`Failed to install packages (exit code ${exitCode}): ${stderr}`);
    }
  }
}

/**
 * Run a command in a sandbox and return the result
 */
export async function runCommandInSandbox(
  sandbox: Sandbox,
  command: string,
  timeoutSeconds: number,
  env: Record<string, string> = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = await sandbox.exec(["bash", "-lc", command], {
    stdout: "pipe",
    stderr: "pipe",
    timeoutMs: timeoutSeconds * 1000,
    env,
    workdir: "/project",
  });
  
  // Read stdout and stderr
  const stdout = await proc.stdout.readText();
  const stderr = await proc.stderr.readText();
  const exitCode = await proc.wait();
  
  return { exitCode, stdout, stderr };
}

/**
 * Execute a complete Modal job
 */
export async function executeModalJob(config: ModalJobConfig): Promise<ModalJobResult> {
  const startTime = Date.now();
  const modal = getModalClient();
  
  let sandbox: Sandbox | null = null;
  
  try {
    // Get or create the app
    const app = await getOrCreateApp(config.appName);
    
    // Create the Python image
    const image = await createPythonImage(config.pythonVersion);
    
    // Create the sandbox with GPU
    // Note: The Modal JS SDK uses GPUType enum, but we'll pass the string directly
    // as the sandbox.create method accepts GPU type strings
    sandbox = await modal.sandboxes.create(app, image, {
      gpu: config.gpu as any, // Cast to Modal GPU type
      timeoutMs: (config.timeoutSeconds + 120) * 1000, // Convert to milliseconds
      idleTimeoutMs: (config.timeoutSeconds + 120) * 1000,
      env: config.env,
    });
    
    const sandboxId = sandbox.sandboxId;
    
    try {
      // Upload project files
      await uploadProjectToSandbox(sandbox, config.projectPath, config.excludePatterns, config.maxUploadMb);
      
      // Install packages
      await installPackages(sandbox, config.extraPackages, config.requirementsFile, config.timeoutSeconds);
      
      // Run setup command if provided
      if (config.setupCommand) {
        await runCommandInSandbox(sandbox, config.setupCommand, config.timeoutSeconds, config.env);
      }
      
      // Run the main command
      const result = await runCommandInSandbox(sandbox, config.command, config.timeoutSeconds, config.env);
      
      const durationMs = Date.now() - startTime;
      
      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs,
        sandboxId,
      };
    } finally {
      // Always terminate the sandbox
      if (sandbox) {
        try {
          await sandbox.terminate();
        } catch (err) {
          console.error("Failed to terminate sandbox:", err);
        }
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new Error(`Modal job failed: ${errorMessage}`);
  }
}
