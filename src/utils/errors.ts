export enum ModalErrorCode {
  AUTH_FAILED = "AUTH_FAILED",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  NETWORK_ERROR = "NETWORK_ERROR",
  USER_CODE_ERROR = "USER_CODE_ERROR",
  TIMEOUT = "TIMEOUT",
  GPU_UNAVAILABLE = "GPU_UNAVAILABLE",
  UPLOAD_FAILED = "UPLOAD_FAILED",
  SANDBOX_CREATION_FAILED = "SANDBOX_CREATION_FAILED",
  PACKAGE_INSTALL_FAILED = "PACKAGE_INSTALL_FAILED",
  UNKNOWN = "UNKNOWN",
}

export class ModalError extends Error {
  public readonly code: ModalErrorCode;
  public readonly remediation?: string;
  public readonly originalError?: Error;

  constructor(
    code: ModalErrorCode,
    message: string,
    options?: { remediation?: string; originalError?: Error }
  ) {
    super(message);
    this.name = "ModalError";
    this.code = code;
    this.remediation = options?.remediation;
    this.originalError = options?.originalError;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ModalError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      remediation: this.remediation,
      stack: this.stack,
      originalError: this.originalError?.message,
    };
  }
}

export function toModalError(error: unknown, context?: string): ModalError {
  if (error instanceof ModalError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const originalError = error instanceof Error ? error : undefined;

  // Classify based on error message patterns
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("authentication") ||
    lowerMessage.includes("token") ||
    lowerMessage.includes("invalid credentials") ||
    lowerMessage.includes("401") ||
    lowerMessage.includes("403")
  ) {
    return new ModalError(ModalErrorCode.AUTH_FAILED, `Authentication failed: ${message}`, {
      remediation: "Check MODAL_TOKEN_ID and MODAL_TOKEN_SECRET environment variables, or run 'modal setup'",
      originalError,
    });
  }

  if (
    lowerMessage.includes("quota") ||
    lowerMessage.includes("limit exceeded") ||
    lowerMessage.includes("capacity") ||
    lowerMessage.includes("429")
  ) {
    return new ModalError(ModalErrorCode.QUOTA_EXCEEDED, `Quota exceeded: ${message}`, {
      remediation: "Check Modal dashboard for GPU quota limits. Try a different GPU type or wait for capacity.",
      originalError,
    });
  }

  if (
    lowerMessage.includes("network") ||
    lowerMessage.includes("connection") ||
    lowerMessage.includes("econnreset") ||
    lowerMessage.includes("etimedout") ||
    lowerMessage.includes("socket hang up") ||
    lowerMessage.includes("fetch failed")
  ) {
    return new ModalError(ModalErrorCode.NETWORK_ERROR, `Network error: ${message}`, {
      remediation: "Check internet connection. The operation will be retried automatically.",
      originalError,
    });
  }

  if (
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("timed out")
  ) {
    return new ModalError(ModalErrorCode.TIMEOUT, `Operation timed out: ${message}`, {
      remediation: "Increase timeout via timeout_seconds parameter or MODAL_MCP_*_TIMEOUT_SECONDS env vars.",
      originalError,
    });
  }

  if (
    lowerMessage.includes("gpu") &&
    (lowerMessage.includes("unavailable") || lowerMessage.includes("not available") || lowerMessage.includes("no capacity"))
  ) {
    return new ModalError(ModalErrorCode.GPU_UNAVAILABLE, `GPU unavailable: ${message}`, {
      remediation: "Try 'any' GPU type to let Modal choose, or select a different GPU.",
      originalError,
    });
  }

  if (
    lowerMessage.includes("upload") ||
    lowerMessage.includes("file") &&
    (lowerMessage.includes("fail") || lowerMessage.includes("error"))
  ) {
    return new ModalError(ModalErrorCode.UPLOAD_FAILED, `Upload failed: ${message}`, {
      remediation: "Add exclude_patterns for large files, or increase max_upload_mb.",
      originalError,
    });
  }

  if (
    lowerMessage.includes("sandbox") &&
    lowerMessage.includes("create")
  ) {
    return new ModalError(ModalErrorCode.SANDBOX_CREATION_FAILED, `Sandbox creation failed: ${message}`, {
      remediation: "Check Modal authentication and quota. Try a different GPU type.",
      originalError,
    });
  }

  if (
    lowerMessage.includes("pip install") ||
    lowerMessage.includes("package") ||
    lowerMessage.includes("requirements")
  ) {
    return new ModalError(ModalErrorCode.PACKAGE_INSTALL_FAILED, `Package installation failed: ${message}`, {
      remediation: "Check requirements.txt for valid packages. Ensure network access to PyPI.",
      originalError,
    });
  }

  // Default: treat as user code error
  return new ModalError(ModalErrorCode.USER_CODE_ERROR, context ? `${context}: ${message}` : message, {
    remediation: "Check the stderr output for details. This is typically a bug in your Python code.",
    originalError,
  });
}