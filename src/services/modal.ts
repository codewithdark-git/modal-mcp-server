import { ModalClient, type Sandbox, type ContainerProcess } from "modal";
import { readdir, stat, readFile } from "node:fs/promises";
import { join, relative, posix } from "node:path";
import { withRetry } from "../utils/retry.js";
import { ModalError, ModalErrorCode, toModalError } from "../utils/errors.js";
import type { JobProgress, JobProgressPhase } from "../core/types.js";

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
  volumeMounts?: VolumeMount[];
  onProgress?: (progress: JobProgress) => void;
  onLog?: (level: "info" | "warn" | "error", message: string) => void;
}

export interface VolumeMount {
  volumeName: string;
  mountPath: string;
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
    try {
      await withRetry(
        () => modal.apps.fromName("modal-mcp-server", { createIfMissing: true }),
        { maxRetries: 2, baseDelayMs: 500 }
      );
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
  return await withRetry(
    () => modal.apps.fromName(appName, { createIfMissing: true }),
    { maxRetries: 2, baseDelayMs: 500 }
  );
}

/**
 * Create a Modal image with the specified Python version
 */
export async function createPythonImage(pythonVersion: string, baseImage?: string): Promise<any> {
  const modal = getModalClient();
  const imageRef = baseImage ?? `python:${pythonVersion}-slim`;
  return modal.images.fromRegistry(imageRef);
}

/**
 * Check if a file path should be excluded based on patterns
 * Supports: ** (recursive), * (single level), ? (single char), [abc] (char class), case-insensitive on Windows
 */
export function shouldExcludeFile(relPath: string, excludePatterns: string[]): boolean {
  const normalizedPath = relPath.replace(/\\/g, "/").toLowerCase();
  
  for (const pattern of excludePatterns) {
    const normalizedPattern = pattern.replace(/\\/g, "/").toLowerCase();
    
    // Handle ** recursive patterns (anywhere in path)
    if (normalizedPattern.includes("**")) {
      const regexPattern = normalizedPattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, ".");
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(normalizedPath)) {
        return true;
      }
    }
    // Handle directory patterns ending with /
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
    // Handle simple * and ? patterns
    else if (normalizedPattern.includes("*") || normalizedPattern.includes("?")) {
      const regexPattern = normalizedPattern
        .replace(/\./g, "\\.")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, ".");
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(normalizedPath)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Collect all files from a directory, respecting exclude patterns and size limits
 * Returns files with progress callback for streaming
 */
export interface FileCollectorOptions {
  dirPath: string;
  excludePatterns: string[];
  maxBytes: number;
  onProgress?: (filesFound: number, bytesFound: number) => void;
  signal?: AbortSignal;
}

export async function collectFiles(
  options: FileCollectorOptions
): Promise<{ files: Array<{ localPath: string; remotePath: string; size: number }>; totalSize: number }> {
  const { dirPath, excludePatterns, maxBytes, onProgress, signal } = options;
  const files: Array<{ localPath: string; remotePath: string; size: number }> = [];
  let totalSize = 0;
  
  async function walkDirectory(currentPath: string, relativePath: string = "") {
    if (signal?.aborted) {
      throw new Error("Upload cancelled");
    }
    
    const entries = await readdir(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (signal?.aborted) {
        throw new Error("Upload cancelled");
      }
      
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
        
        onProgress?.(files.length, totalSize);
      }
    }
  }
  
  await walkDirectory(dirPath);
  return { files, totalSize };
}

/**
 * Quickly estimate project size without full walk (for early rejection)
 */
export async function estimateProjectSize(
  dirPath: string,
  excludePatterns: string[],
  maxFilesToCheck: number = 1000
): Promise<{ estimatedSize: number; fileCount: number }> {
  let estimatedSize = 0;
  let fileCount = 0;
  
  async function walkDirectory(currentPath: string, relativePath: string = "") {
    if (fileCount >= maxFilesToCheck) return;
    
    try {
      const entries = await readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (fileCount >= maxFilesToCheck) break;
        
        const fullPath = join(currentPath, entry.name);
        const relPath = relativePath ? join(relativePath, entry.name) : entry.name;
        
        if (entry.isDirectory()) {
          await walkDirectory(fullPath, relPath);
        } else if (entry.isFile()) {
          if (shouldExcludeFile(relPath, excludePatterns)) continue;
          
          try {
            const fileStat = await stat(fullPath);
            estimatedSize += fileStat.size;
            fileCount++;
          } catch {
            // Ignore stat errors
          }
        }
      }
    } catch {
      // Ignore directory read errors
    }
  }
  
  await walkDirectory(dirPath);
  
  // Extrapolate if we hit the limit
  if (fileCount >= maxFilesToCheck) {
    const avgSize = estimatedSize / fileCount;
    // This is a rough estimate - in reality we'd need a full walk
  }
  
  return { estimatedSize, fileCount };
}

/**
 * Upload project files to a sandbox with progress and cancellation support
 */
export interface UploadOptions {
  sandbox: Sandbox;
  projectPath: string;
  excludePatterns: string[];
  maxUploadMb: number;
  concurrency?: number;
  onProgress?: (completed: number, total: number, currentFile: string, bytesCompleted: number, bytesTotal: number) => void;
  signal?: AbortSignal;
}

export async function uploadProjectToSandbox(options: UploadOptions): Promise<void> {
  const { sandbox, projectPath, excludePatterns, maxUploadMb, concurrency = 10, onProgress, signal } = options;
  const maxBytes = maxUploadMb * 1024 * 1024;

  // Create the /project directory in the sandbox
  await withRetry(
    () => sandbox.filesystem.makeDirectory("/project"),
    { maxRetries: 2, baseDelayMs: 500 }
  );

  // Collect all files to upload
  const { files, totalSize } = await collectFiles({
    dirPath: projectPath,
    excludePatterns,
    maxBytes,
    signal,
  });

  if (files.length === 0) {
    console.log(`[modal] No files to upload from ${projectPath}`);
    return;
  }

  console.log(`[modal] Uploading ${files.length} files (${totalSize} bytes) to sandbox ${sandbox.sandboxId}`);

  // Upload files concurrently with a limit
  let completed = 0;
  let bytesCompleted = 0;

  for (let i = 0; i < files.length; i += concurrency) {
    if (signal?.aborted) {
      throw new Error("Upload cancelled");
    }

    const batch = files.slice(i, i + concurrency);
    const batchPromises = batch.map(async (file) => {
      if (signal?.aborted) throw new Error("Upload cancelled");

      await withRetry(
        () => sandbox.filesystem.copyFromLocal(file.localPath, file.remotePath),
        { maxRetries: 2, baseDelayMs: 500 }
      );

      completed++;
      bytesCompleted += file.size;
      onProgress?.(completed, files.length, file.remotePath, bytesCompleted, totalSize);
    });

    await Promise.all(batchPromises);
  }

  console.log(`[modal] Upload complete: ${files.length} files uploaded`);
}

/**
 * Install Python packages in a sandbox with retry
 */
export async function installPackages(
  sandbox: Sandbox,
  packages: string[],
  requirementsFile?: string,
  timeoutSeconds: number = 300
): Promise<void> {
  const runCommand = async (cmd: string, description: string) => {
    await withRetry(
      async () => {
        const proc = await sandbox.exec(["bash", "-lc", cmd], {
          stdout: "pipe",
          stderr: "pipe",
          timeoutMs: timeoutSeconds * 1000,
        });
        
        const exitCode = await proc.wait();
        if (exitCode !== 0) {
          const stderr = await proc.stderr.readText();
          throw new Error(`Failed to ${description} (exit code ${exitCode}): ${stderr}`);
        }
      },
      { maxRetries: 2, baseDelayMs: 1000 }
    );
  };
  
  if (requirementsFile) {
    const cmd = `pip install --disable-pip-version-check --no-input -r /project/${requirementsFile}`;
    await runCommand(cmd, "install from requirements.txt");
  }
  
  if (packages.length > 0) {
    const pkgList = packages.join(" ");
    const cmd = `pip install --disable-pip-version-check --no-input ${pkgList}`;
    await runCommand(cmd, `install packages: ${pkgList}`);
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
  
  const stdout = await proc.stdout.readText();
  const stderr = await proc.stderr.readText();
  const exitCode = await proc.wait();
  
  return { exitCode, stdout, stderr };
}

/**
 * Execute a complete Modal job with retry logic
 */
export async function executeModalJob(config: ModalJobConfig): Promise<ModalJobResult> {
  const startTime = Date.now();
  const modal = getModalClient();

  // Helper to emit progress
  const emitProgress = (phase: JobProgressPhase, completed: number, total: number, currentFile?: string, message?: string) => {
    config.onProgress?.({
      phase,
      completed,
      total,
      currentFile,
      message,
    });
  };

  let sandbox: Sandbox | null = null;

  try {
    // Get or create the app
    const app = await getOrCreateApp(config.appName);

    // Create the Python image
    const image = await createPythonImage(config.pythonVersion);

    // Create the sandbox with GPU (or none for CPU-only)
    const gpuConfig = config.gpu === "none" ? undefined : config.gpu;

    // Build sandbox options with volume mounts if provided
    const sandboxOptions: any = {
      gpu: gpuConfig as any,
      timeoutMs: (config.timeoutSeconds + 120) * 1000,
      idleTimeoutMs: (config.timeoutSeconds + 120) * 1000,
      env: config.env,
    };

    if (config.volumeMounts && config.volumeMounts.length > 0) {
      sandboxOptions.mounts = config.volumeMounts.map(vm => ({
        volumeName: vm.volumeName,
        mountPath: vm.mountPath,
      }));
    }

    emitProgress("running", 0, 1, undefined, "Creating sandbox...");
    sandbox = await withRetry(
      () => modal.sandboxes.create(app, image, sandboxOptions),
      {
        maxRetries: 3,
        baseDelayMs: 2000,
        retryableCodes: [ModalErrorCode.NETWORK_ERROR, ModalErrorCode.GPU_UNAVAILABLE, ModalErrorCode.QUOTA_EXCEEDED]
      }
    );

    const sandboxId = sandbox.sandboxId;

    try {
      // Upload project files
      emitProgress("collecting", 0, 1, undefined, "Collecting files to upload...");
      await uploadProjectToSandbox({
        sandbox,
        projectPath: config.projectPath,
        excludePatterns: config.excludePatterns,
        maxUploadMb: config.maxUploadMb,
        onProgress: (completed, total, currentFile, bytesCompleted, bytesTotal) => {
          emitProgress("uploading", completed, total, currentFile,
            `Uploading ${completed}/${total} files (${Math.round(bytesCompleted/1024)}KB / ${Math.round(bytesTotal/1024)}KB)`);
        },
      });

      // Install packages
      emitProgress("installing", 0, 1, undefined, "Installing Python packages...");
      await installPackages(sandbox, config.extraPackages, config.requirementsFile, config.timeoutSeconds);
      emitProgress("installing", 1, 1, undefined, "Package installation complete");

      // Run setup command if provided
      if (config.setupCommand) {
        emitProgress("running", 0, 1, undefined, "Running setup command...");
        await runCommandInSandbox(sandbox, config.setupCommand, config.timeoutSeconds, config.env);
        emitProgress("running", 1, 1, undefined, "Setup command complete");
      }

      // Run the main command
      emitProgress("running", 0, 1, undefined, `Running: ${config.command}`);
      const result = await runCommandInSandbox(sandbox, config.command, config.timeoutSeconds, config.env);
      emitProgress("running", 1, 1, undefined, "Command completed");

      const durationMs = Date.now() - startTime;

      emitProgress("complete", 1, 1, undefined, "Job completed successfully");

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
    emitProgress("error", 0, 1, undefined, err instanceof Error ? err.message : String(err));
    const modalError = toModalError(err, "Modal job failed");
    throw modalError;
  }
}