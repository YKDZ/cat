import { describe, it, expect, beforeEach } from "vitest";

import { clearTokenCache, getAuthEnv } from "./github-app-auth.js";

describe("GitHub App Auth", () => {
  beforeEach(() => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    clearTokenCache();
  });

  it("throws when GITHUB_APP_ID is not set", () => {
    expect(() => getAuthEnv()).toThrow("Missing GitHub App configuration");
  });

  it("throws when GITHUB_APP_PRIVATE_KEY is missing", () => {
    process.env.GITHUB_APP_ID = "123";
    process.env.GITHUB_APP_INSTALLATION_ID = "456";
    expect(() => getAuthEnv()).toThrow("Missing GitHub App configuration");
  });

  it("throws when GITHUB_APP_INSTALLATION_ID is missing", () => {
    process.env.GITHUB_APP_ID = "123";
    process.env.GITHUB_APP_PRIVATE_KEY =
      "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----";
    expect(() => getAuthEnv()).toThrow("Missing GitHub App configuration");
  });
});
