import {
  TRUSTED_WALLET_INSTALL_URL,
  DEFAULT_FALLBACK_CONSTANTS,
  getConstant,
  validateConstantUrl,
  executeWithRecovery,
  createConstantRegistry,
  formatConstantMessage,
} from "./constants";

describe("constants.js backward compatibility and invariants", () => {
  it("preserves established TRUSTED_WALLET_INSTALL_URL export", () => {
    expect(TRUSTED_WALLET_INSTALL_URL).toBe("https://www.stellar.org/wallets");
  });

  it("exports deeply frozen DEFAULT_FALLBACK_CONSTANTS dictionary", () => {
    expect(DEFAULT_FALLBACK_CONSTANTS).toBeDefined();
    expect(Object.isFrozen(DEFAULT_FALLBACK_CONSTANTS)).toBe(true);
    expect(DEFAULT_FALLBACK_CONSTANTS.TRUSTED_WALLET_INSTALL_URL).toBe(
      "https://www.stellar.org/wallets"
    );
    expect(DEFAULT_FALLBACK_CONSTANTS.DEFAULT_STELLAR_NETWORK).toBe("PUBLIC");
  });
});

describe("getConstant with deterministic failure recovery", () => {
  it("retrieves valid existing constants", () => {
    expect(getConstant("TRUSTED_WALLET_INSTALL_URL")).toBe("https://www.stellar.org/wallets");
    expect(getConstant("DEFAULT_STELLAR_NETWORK")).toBe("PUBLIC");
  });

  it("recovers deterministically with custom fallback on missing keys", () => {
    const fallback = "custom-fallback-value";
    expect(getConstant("NON_EXISTENT_KEY", fallback)).toBe(fallback);
  });

  it("recovers deterministically on invalid or boundary keys", () => {
    // @ts-ignore
    expect(getConstant(null, "fallback")).toBe("fallback");
    // @ts-ignore
    expect(getConstant(undefined, "fallback")).toBe("fallback");
    expect(getConstant("", "fallback")).toBe("fallback");
    expect(getConstant("   ", "fallback")).toBe("fallback");
    // @ts-ignore
    expect(getConstant(12345, "fallback")).toBe("fallback");
  });

  it("returns null when key is missing and no fallback is specified", () => {
    expect(getConstant("UNKNOWN_KEY")).toBeNull();
  });
});

describe("validateConstantUrl with deterministic recovery", () => {
  it("validates and preserves clean HTTP and HTTPS URLs", () => {
    expect(validateConstantUrl("https://horizon.stellar.org")).toBe("https://horizon.stellar.org/");
    expect(validateConstantUrl("http://localhost:3000/api")).toBe("http://localhost:3000/api");
  });

  it("deterministically falls back on malicious protocols", () => {
    expect(validateConstantUrl("javascript:alert(1)")).toBe(TRUSTED_WALLET_INSTALL_URL);
    expect(validateConstantUrl("data:text/html,<script>")).toBe(TRUSTED_WALLET_INSTALL_URL);
    expect(validateConstantUrl("file:///etc/passwd")).toBe(TRUSTED_WALLET_INSTALL_URL);
  });

  it("deterministically falls back on URLs with embedded credentials", () => {
    expect(validateConstantUrl("https://admin:secret@malicious.com/endpoint")).toBe(
      TRUSTED_WALLET_INSTALL_URL
    );
  });

  it("deterministically falls back on malformed or empty inputs", () => {
    expect(validateConstantUrl("not a valid url")).toBe(TRUSTED_WALLET_INSTALL_URL);
    // @ts-ignore
    expect(validateConstantUrl(null)).toBe(TRUSTED_WALLET_INSTALL_URL);
    // @ts-ignore
    expect(validateConstantUrl(undefined)).toBe(TRUSTED_WALLET_INSTALL_URL);
    expect(validateConstantUrl("")).toBe(TRUSTED_WALLET_INSTALL_URL);
  });

  it("supports custom fallback URLs when recovering from failure", () => {
    const customFallback = "https://custom.stellar.org";
    expect(validateConstantUrl("invalid-url", customFallback)).toBe(customFallback);
  });
});

describe("executeWithRecovery in constants.js", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("rejects non-function operations deterministically", async () => {
    // @ts-ignore
    await expect(executeWithRecovery(null)).rejects.toThrow("operation must be a function");
  });

  it("handles successful operation on initial execution", async () => {
    const op = jest.fn().mockResolvedValue("resolved_constant");
    const result = await executeWithRecovery(op);
    expect(result).toBe("resolved_constant");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("handles idempotent retries and recovers from transient failure", async () => {
    let attempts = 0;
    const op = jest.fn().mockImplementation(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("Temporary network timeout");
      }
      return "recovered_data";
    });

    const result = await executeWithRecovery(op, {
      retries: 3,
      timeoutMs: 50,
    });
    expect(result).toBe("recovered_data");
    expect(attempts).toBe(3);
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("exhausts retries and returns deterministic fallback without crashing", async () => {
    const op = jest.fn().mockRejectedValue(new Error("Fatal connection error"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const fallbackData = { defaultWallet: "freighter" };
    const result = await executeWithRecovery(op, {
      retries: 2,
      timeoutMs: 50,
      fallback: fallbackData,
    });

    expect(result).toBe(fallbackData);
    expect(op).toHaveBeenCalledTimes(3); // Initial + 2 retries
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[constants] Operation failed after 2 retries:")
    );

    consoleSpy.mockRestore();
  });

  it("throws sanitized error if retries are exhausted and no fallback is given", async () => {
    const op = jest.fn().mockRejectedValue(new Error("Internal API connection failure"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(executeWithRecovery(op, { retries: 1, timeoutMs: 50 })).rejects.toThrow(
      "Deterministic failure recovery exhausted"
    );

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(op).toHaveBeenCalledTimes(2);

    consoleSpy.mockRestore();
  });

  it("enforces timing boundaries and timeouts", async () => {
    const op = jest
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("too_late"), 100))
      );

    await expect(executeWithRecovery(op, { retries: 0, timeoutMs: 10 })).rejects.toThrow(
      "Deterministic failure recovery exhausted: Timeout"
    );
  });
});

describe("createConstantRegistry immutable factory", () => {
  it("creates a deeply frozen registry with default constants", () => {
    const registry = createConstantRegistry();
    expect(registry).toBeDefined();
    expect(Object.isFrozen(registry)).toBe(true);
    expect(registry.TRUSTED_WALLET_INSTALL_URL).toBe("https://www.stellar.org/wallets");
  });

  it("safely merges and sanitizes URL overrides", () => {
    const registry = createConstantRegistry({
      CUSTOM_API_URL: "https://api.liquifact.io",
      MALICIOUS_URL: "javascript:evil()",
    });

    expect(registry.CUSTOM_API_URL).toBe("https://api.liquifact.io/");
    expect(registry.MALICIOUS_URL).toBe(TRUSTED_WALLET_INSTALL_URL);
  });

  it("prevents runtime tampering of registry values", () => {
    const registry = createConstantRegistry();
    expect(() => {
      // @ts-ignore
      registry.TRUSTED_WALLET_INSTALL_URL = "https://tampered.com";
    }).toThrow();
  });
});

describe("formatConstantMessage helper", () => {
  it("formats template strings with provided parameters", () => {
    const template = "Visit {network} at {url}";
    const formatted = formatConstantMessage(template, {
      network: "Stellar",
      url: "https://stellar.org",
    });
    expect(formatted).toBe("Visit Stellar at https://stellar.org");
  });

  it("recovers deterministically when template or params are invalid", () => {
    // @ts-ignore
    expect(formatConstantMessage(null, {}, "fallback_message")).toBe("fallback_message");
    // @ts-ignore
    expect(formatConstantMessage(undefined, {}, "fallback_message")).toBe("fallback_message");
  });

  it("leaves unmatched placeholders intact", () => {
    const template = "Key: {key}, Other: {unmatched}";
    expect(formatConstantMessage(template, { key: "val" })).toBe("Key: val, Other: {unmatched}");
  });
});
