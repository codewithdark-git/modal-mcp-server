import { ModalClient, type Sandbox, type ContainerProcess } from "modal";
import { readdir, stat, readFile } from "node:fs/promises";
import { join, relative, posix } from "node:path";

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
}

export interface ModalJobResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  sandboxId: string;
}

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableErrors: [
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "rate limit",
    "too many requests",
    "temporarily unavailable",
    "service unavailable",
    "502",
    "503",
    "504",
  ],
};

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();
  
  // Check for retryable error codes
  for (const retryable of RETRY_CONFIG.retryableErrors) {
    if (errorMessage.includes(retryable) || errorName.includes(retryable)) {
      return true;
    }
  }
  
  // Check for Modal-specific retryable errors
  if (errorMessage.includes("modal") && errorMessage.includes("retry")) {
    return true;
  }
  
  return false;
}

/**
 * Execute a function with retry logic
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  operationName: string,
  retryCount: number = 0
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retryCount >= RETRY_CONFIG.maxRetries) {
      throw new Error(
        `Operation '${operationName}' failed after ${RETRY_CONFIG.maxRetries} retries: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    
    if (isRetryableError(error)) {
      const delayMs = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(2, retryCount),
        RETRY_CONFIG.maxDelayMs
      );
      console.log(
        `[modal] Retryable error in '${operationName}': ${error instanceof Error ? error.message : String(error)}. Retrying in ${delayMs}ms...`
      );
      await sleep(delayMs);
      return withRetry(fn, operationName, retryCount + 1);
    }
    
    // Non-retryable error, rethrow
    throw error;
  }
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
      await withRetry(
        () => modal.apps.fromName("modal-mcp-server", { createIfMissing: true }),
        "authentication check"
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
    "getOrCreateApp"
  );
}

/**
 * Create a Modal image with the specified Python version
 */
export async function createPythonImage(pythonVersion: string): Promise<any> {
  const modal = getModalClient();
  // Use Modal's built-in Python image
  return await withRetry(
    async () => modal.images.fromRegistry(`python:${pythonVersion}-slim`),
    "createPythonImage"
  );
}

/**
 * Check if a file path should be excluded based on patterns
 * Enhanced to support more glob patterns and case-insensitive matching on Windows
 */
function shouldExcludeFile(relPath: string, excludePatterns: string[]): boolean {
  const normalizedPath = relPath.replace(/\\/g, "/");
  const isWindows = process.platform === "win32";
  
  for (const pattern of excludePatterns) {
    let normalizedPattern = pattern.replace(/\\/g, "/");
    
    // Normalize pattern for case-insensitive matching on Windows
    const pathToMatch = isWindows ? normalizedPath.toLowerCase() : normalizedPath;
    const patternToMatch = isWindows ? normalizedPattern.toLowerCase() : normalizedPattern;
    
    // Handle ** patterns (recursive)
    if (patternToMatch.endsWith("/**")) {
      const prefix = patternToMatch.slice(0, -3).replace(/\/+$/, "");
      if (pathToMatch === prefix || pathToMatch.startsWith(prefix + "/")) {
        return true;
      }
    }
    // Handle ** in middle of pattern (e.g., **/node_modules/**)
    else if (patternToMatch.includes("**")) {
      const regexPattern = patternToMatch
        .replace(/\*/g, "[^/]*")  // Replace * with [^/]*
        .replace(/\*\*/g, ".*")   // Replace ** with .*
        .replace(/[.^$|()\[\]{}+\\]/g, "\\$&"); // Escape regex special chars
      
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(pathToMatch)) {
        return true;
      }
    }
    // Handle directory patterns
    else if (patternToMatch.endsWith("/")) {
      const prefix = patternToMatch.slice(0, -1);
      if (pathToMatch === prefix || pathToMatch.startsWith(prefix + "/")) {
        return true;
      }
    }
    // Handle exact file patterns
    else if (pathToMatch === patternToMatch) {
      return true;
    }
    // Handle glob patterns (simple * matching)
    else if (patternToMatch.includes("*")) {
      const patternParts = patternToMatch.split("/");
      const pathParts = pathToMatch.split("/");
      
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
    // Handle ? single character wildcard
    else if (patternToMatch.includes("?")) {
      const regexPattern = patternToMatch.replace(/[.^$|()\[\]{}+\\]/g, "\\$&")
        .replace(/\?/g, ".")
        .replace(/\*/g, "[^/]*");
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(pathToMatch)) {
        return true;
      }
    }
    // Handle character classes [abc]
    else if (patternToMatch.includes("[")) {
      const regexPattern = patternToMatch.replace(/[.^$|()\[\]{}+\\]/g, "\\$&")
        .replace(/\*/g, "[^/]*");
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(pathToMatch)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Collect all files from a directory, respecting exclude patterns and size limits
 * Now with progress reporting
 */
async function collectFiles(
  dirPath: string,
  excludePatterns: string[],
  maxBytes: number,
  onProgress?: (filesCollected: number, totalSize: number) => void
): Promise<{ files: Array<{ localPath: string; remotePath: string; size: number }>; totalSize: number }> {
  const files: Array<{ localPath: string; remotePath: string; size: number }> = [];
  let totalSize = 0;
  let filesCollected = 0;
  
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
            `Upload is larger than the configured max_upload_mb limit (${maxMb.toFixed(0)} MiB). ` +
            `Current size: ${(totalSize / (1024 * 1024)).toFixed(0)} MiB. ` +
            `Add exclude_patterns or raise max_upload_mb.`
          );
        }
        
        files.push({
          localPath: fullPath,
          remotePath: posix.join("/project", relPath),
          size: fileSize,
        });
        totalSize += fileSize;
        filesCollected++;
        
        // Report progress every 100 files or so
        if (onProgress && filesCollected % 100 === 0) {
          onProgress(filesCollected, totalSize);
        }
      }
    }
  }
  
  await walkDirectory(dirPath);
  return { files, totalSize };
}

/**
 * Upload project files to a sandbox with progress reporting
 */
export async function uploadProjectToSandbox(
  sandbox: Sandbox,
  projectPath: string,
  excludePatterns: string[],
  maxUploadMb: number,
  onProgress?: (uploaded: number, total: number, currentFile?: string) => void
): Promise<void> {
  const maxBytes = maxUploadMb * 1024 * 1024;
  
  // Create the /project directory in the sandbox
  await withRetry(
    () => sandbox.filesystem.makeDirectory("/project"),
    "create project directory"
  );
  
  // Collect all files to upload with progress
  const { files, totalSize } = await collectFiles(projectPath, excludePatterns, maxBytes, (collected, size) => {
    if (onProgress) {
      onProgress(collected, size);
    }
  });
  
  if (files.length === 0) {
    console.log(`[modal] No files to upload from ${projectPath}`);
    return;
  }
  
  console.log(`[modal] Uploading ${files.length} files (${formatBytes(totalSize)}) to sandbox ${sandbox.sandboxId}`);
  
  // Upload files concurrently with a limit to avoid overwhelming the sandbox
  const CONCURRENCY_LIMIT = 10;
  const uploadPromises: Promise<void>[] = [];
  
  for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
    const batch = files.slice(i, i + CONCURRENCY_LIMIT);
    
    for (const file of batch) {
      const uploadPromise = withRetry(
        () => sandbox.filesystem.copyFromLocal(file.localPath, file.remotePath),
        `upload ${file.remotePath}`
      )
        .then(() => {
          if (onProgress) {
            onProgress(i + batch.indexOf(file) + 1, files.length, file.remotePath);
          }
          console.log(`[modal] Uploaded: ${file.remotePath}`);
        })
        .catch((error: Error) => {
          console.error(`[modal] Failed to upload ${file.localPath}: ${error.message}`);
          throw error;
        });
      
      uploadPromises.push(uploadPromise);
    }
    
    // Wait for this batch to complete before starting next
    await Promise.all(uploadPromises.slice(-batch.length));
  }
  
  // Wait for all uploads to complete
  await Promise.all(uploadPromises);
  
  console.log(`[modal] Upload complete: ${files.length} files uploaded`);
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
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
  if (requirementsFile) {
    // Install from requirements file
    const cmd = `pip install --disable-pip-version-check --no-input -r /project/${requirementsFile}`;
    const proc = await withRetry(
      async () => sandbox.exec(["bash", "-lc", cmd], {
        stdout: "pipe",
        stderr: "pipe",
        timeoutMs: timeoutSeconds * 1000,
      }),
      "pip install from requirements"
    );
    
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
    const proc = await withRetry(
      async () => sandbox.exec(["bash", "-lc", cmd], {
        stdout: "pipe",
        stderr: "pipe",
        timeoutMs: timeoutSeconds * 1000,
      }),
      "pip install packages"
    );
    
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
  const proc = await withRetry(
    async () => sandbox.exec(["bash", "-lc", command], {
      stdout: "pipe",
      stderr: "pipe",
      timeoutMs: timeoutSeconds * 1000,
      env,
      workdir: "/project",
    }),
    "execute command"
  );
  
  // Read stdout and stderr
  const stdout = await proc.stdout.readText();
  const stderr = await proc.stderr.readText();
  const exitCode = await proc.wait();
  
  return { exitCode, stdout, stderr };
}

/**
 * Execute a complete Modal job with enhanced error handling
 */
export async function executeModalJob(config: ModalJobConfig): Promise<ModalJobResult> {
  const startTime = Date.now();
  const modal = getModalClient();
  
  let sandbox: Sandbox | null = null;
  let sandboxId: string = "";
  
  try {
    // Get or create the app
    const app = await getOrCreateApp(config.appName);
    
    // Create the Python image
    const image = await createPythonImage(config.pythonVersion);
    
    // Create the sandbox with GPU
    // Support "none" for CPU-only execution
    const gpuConfig = config.gpu.toLowerCase() === "none" ? undefined : config.gpu;
    
    sandbox = await withRetry(
      async () => modal.sandboxes.create(app, image, {
        gpu: gpuConfig as any, // Cast to Modal GPU type
        timeoutMs: (config.timeoutSeconds + 120) * 1000, // Convert to milliseconds
        idleTimeoutMs: (config.timeoutSeconds + 120) * 1000,
        env: config.env,
      }),
      "create sandbox"
    );
    
    sandboxId = sandbox.sandboxId;
    
    try {
      // Upload project files with progress
      await uploadProjectToSandbox(
        sandbox, 
        config.projectPath, 
        config.excludePatterns, 
        config.maxUploadMb,
        (uploaded, total, currentFile) => {
          if (total > 0) {
            const percent = Math.round((uploaded / total) * 100);
            console.log(`[modal] Upload progress: ${uploaded}/${total} files (${percent}%) - ${currentFile || ''}`);
          }
        }
      );
      
      // Install packages
      await installPackages(sandbox, config.extraPackages, config.requirementsFile, config.timeoutSeconds);
      
      // Run setup command if provided
      if (config.setupCommand) {
        console.log(`[modal] Running setup command: ${config.setupCommand}`);
        await runCommandInSandbox(sandbox, config.setupCommand, config.timeoutSeconds, config.env);
      }
      
      // Run the main command
      console.log(`[modal] Running command: ${config.command}`);
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
      if (sandbox !== null) {
        try {
          await withRetry(
            () => sandbox!.terminate(),
            "terminate sandbox"
          );
        } catch (err) {
          console.error("Failed to terminate sandbox:", err);
        }
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    
    // Create a more detailed error message
    let enhancedMessage = `Modal job failed: ${errorMessage}`;
    
    if (errorStack) {
      enhancedMessage += `\nStack: ${errorStack}`;
    }
    
    // Add troubleshooting suggestions based on error type
    if (errorMessage.toLowerCase().includes("authentication") || 
        errorMessage.toLowerCase().includes("token")) {
      enhancedMessage += `\n\nTroubleshooting: Check MODAL_TOKEN_ID and MODAL_TOKEN_SECRET environment variables.`;
    } else if (errorMessage.toLowerCase().includes("quota") || 
               errorMessage.toLowerCase().includes("limit")) {
      enhancedMessage += `\n\nTroubleshooting: Check your Modal account quota at https://modal.com`;
    } else if (errorMessage.toLowerCase().includes("gpu") || 
               errorMessage.toLowerCase().includes("unavailable")) {
      enhancedMessage += `\n\nTroubleshooting: Try a different GPU type or use 'any' for automatic selection.`;
    } else if (errorMessage.toLowerCase().includes("timeout")) {
      enhancedMessage += `\n\nTroubleshooting: Increase the timeout parameter or check for slow operations.`;
    }
    
    throw new Error(enhancedMessage);
  }
}
