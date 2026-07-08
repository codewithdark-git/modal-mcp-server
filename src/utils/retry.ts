export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableCodes?: ModalErrorCode[];
  onRetry?: (attempt: number, error: Error) => void;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableCodes: [
    ModalErrorCode.NETWORK_ERROR,
    ModalErrorCode.TIMEOUT,
    ModalErrorCode.GPU_UNAVAILABLE,
    ModalErrorCode.QUOTA_EXCEEDED,
  ],
};

import { ModalError, ModalErrorCode, toModalError } from "./errors.js";

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const modalError = toModalError(lastError);

      // Check if we should retry
      const isRetryable = opts.retryableCodes?.includes(modalError.code) ?? false;
      const isLastAttempt = attempt === opts.maxRetries;

      if (!isRetryable || isLastAttempt) {
        throw modalError;
      }

      // Calculate delay with exponential backoff + jitter
      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        opts.maxDelayMs
      );

      opts.onRetry?.(attempt + 1, modalError);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}