/**
 * Centralized constants and deterministic failure recovery utilities for the application.
 */

export const TRUSTED_WALLET_INSTALL_URL = "https://www.stellar.org/wallets";

/**
 * Immutable system defaults and fallback values.
 * Deeply frozen to prevent runtime tampering or cross-request pollution.
 */
export const DEFAULT_FALLBACK_CONSTANTS = Object.freeze({
  TRUSTED_WALLET_INSTALL_URL: "https://www.stellar.org/wallets",
  DEFAULT_STELLAR_NETWORK: "PUBLIC",
  DEFAULT_HORIZON_URL: "https://horizon.stellar.org",
  DEFAULT_TIMEOUT_MS: 5000,
  MAX_RETRY_ATTEMPTS: 3,
});

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Safely retrieves a constant value with deterministic fallback recovery.
 *
 * @param {string} key - The constant identifier.
 * @param {*} [fallback] - Optional custom fallback value if key is not found or invalid.
 * @returns {*} The resolved constant value or deterministic fallback.
 */
export function getConstant(key, fallback = undefined) {
  if (typeof key !== "string" || !key.trim()) {
    return fallback !== undefined ? fallback : (DEFAULT_FALLBACK_CONSTANTS[key] ?? null);
  }

  const trimmedKey = key.trim();
  if (trimmedKey in DEFAULT_FALLBACK_CONSTANTS) {
    return DEFAULT_FALLBACK_CONSTANTS[trimmedKey];
  }

  return fallback !== undefined ? fallback : null;
}

/**
 * Validates and sanitizes a URL constant with deterministic fallback recovery.
 * Guarantees a safe, valid absolute HTTP(S) URL without credentials.
 *
 * @param {string} url - The URL string to validate.
 * @param {string} [fallbackUrl=TRUSTED_WALLET_INSTALL_URL] - Safe fallback URL if input is invalid.
 * @returns {string} Safe validated URL or deterministic fallback.
 */
export function validateConstantUrl(url, fallbackUrl = TRUSTED_WALLET_INSTALL_URL) {
  const safeFallback =
    typeof fallbackUrl === "string" && fallbackUrl.trim()
      ? fallbackUrl.trim()
      : TRUSTED_WALLET_INSTALL_URL;

  if (typeof url !== "string" || !url.trim()) {
    return safeFallback;
  }

  try {
    const parsed = new URL(url.trim());
    if (
      !ALLOWED_PROTOCOLS.has(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return safeFallback;
    }
    return parsed.href;
  } catch {
    return safeFallback;
  }
}

/**
 * Executes an async constant retrieval or dependency operation with deterministic failure recovery.
 * Enforces bounded retries, timeouts, and safe observability.
 *
 * @param {Function} operation - Async function to execute.
 * @param {Object} [options={}] - Configuration options.
 * @param {number} [options.retries=3] - Number of retry attempts.
 * @param {*} [options.fallback=undefined] - Fallback value on failure.
 * @param {number} [options.timeoutMs=5000] - Timeout per attempt in milliseconds.
 * @returns {Promise<*>} The operation result or deterministic fallback.
 */
export async function executeWithRecovery(operation, options = {}) {
  if (typeof operation !== "function") {
    throw new Error("executeWithRecovery: operation must be a function");
  }

  const { retries = 3, fallback = undefined, timeoutMs = 5000 } = options;
  let attempt = 0;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await Promise.race([
        operation(),
        new Promise((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("Timeout")));
        }),
      ]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      attempt++;
      if (attempt > retries) {
        // Safe diagnostic observability without leaking sensitive payloads
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`[constants] Operation failed after ${retries} retries: ${errorMessage}`);

        if (fallback !== undefined) {
          return fallback;
        }
        throw new Error(`Deterministic failure recovery exhausted: ${errorMessage}`);
      }
      // Deterministic exponential backoff
      await new Promise((r) => setTimeout(r, 10 * attempt));
    }
  }
}

/**
 * Creates an immutable constants registry from base defaults with optional overrides.
 *
 * @param {Object} [overrides={}] - Optional custom constant overrides.
 * @returns {Readonly<Object>} Deeply frozen constants registry.
 */
export function createConstantRegistry(overrides = {}) {
  const base = { ...DEFAULT_FALLBACK_CONSTANTS };

  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    for (const [key, value] of Object.entries(overrides)) {
      if (typeof key === "string" && key.trim() && value !== undefined) {
        if (key.endsWith("_URL") && typeof value === "string") {
          base[key] = validateConstantUrl(value, base[key] || base.TRUSTED_WALLET_INSTALL_URL);
        } else {
          base[key] = value;
        }
      }
    }
  }

  return Object.freeze(base);
}

/**
 * Safely formats a parameterized template string with deterministic recovery.
 *
 * @param {string} template - The template string with {key} placeholders.
 * @param {Object} params - Key-value replacements.
 * @param {string} [fallback=""] - Fallback string if formatting fails.
 * @returns {string} Formatted string or deterministic fallback.
 */
export function formatConstantMessage(template, params = {}, fallback = "") {
  if (typeof template !== "string") {
    return fallback;
  }

  try {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      if (params && Object.prototype.hasOwnProperty.call(params, key)) {
        const val = params[key];
        return val !== null && val !== undefined ? String(val) : match;
      }
      return match;
    });
  } catch {
    return fallback;
  }
}
