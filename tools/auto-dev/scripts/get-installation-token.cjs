#!/usr/bin/env node
"use strict";
/**
 * get-installation-token.cjs
 * Bootstrap script that exchanges GitHub App credentials for an installation
 * access token. Prints only the raw token on stdout so the shell entrypoint
 * can capture it with $(node .../get-installation-token.cjs).
 *
 * Required env vars:
 *   GITHUB_APP_ID
 *   GITHUB_APP_PRIVATE_KEY
 *   GITHUB_APP_INSTALLATION_ID
 */

const https = require("node:https");
const crypto = require("node:crypto");

const appId = process.env.GITHUB_APP_ID;
const rawKey = process.env.GITHUB_APP_PRIVATE_KEY;
const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

if (!appId || !rawKey || !installationId) {
  process.stderr.write(
    "[auto-dev] ERROR: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_INSTALLATION_ID must be set.\n"
  );
  process.exit(1);
}

// Normalize escaped newlines coming from Docker env vars
const privateKey = rawKey.replace(/\\n/g, "\n");

/**
 * Minimal RS256 JWT implementation using Node's built-in crypto.
 * Avoids needing jsonwebtoken at bootstrap time.
 */
function base64url(buf) {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signJwt(payload, privateKeyPem) {
  const header = base64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const sigInput = `${header}.${body}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(sigInput);
  const sig = base64url(sign.sign(privateKeyPem));
  return `${sigInput}.${sig}`;
}

const now = Math.floor(Date.now() / 1000);
const appJwt = signJwt({ iat: now - 60, exp: now + 600, iss: appId }, privateKey);

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  try {
    const { status, body } = await request(
      {
        hostname: "api.github.com",
        path: `/app/installations/${installationId}/access_tokens`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${appJwt}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "auto-dev-bootstrap/1.0",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
      "",
    );

    if (status !== 201) {
      process.stderr.write(
        `[auto-dev] ERROR: GitHub API returned HTTP ${status}: ${body}\n`
      );
      process.exit(1);
    }

    const json = JSON.parse(body);
    if (!json.token) {
      process.stderr.write("[auto-dev] ERROR: No token in GitHub API response.\n");
      process.exit(1);
    }

    process.stdout.write(json.token);
  } catch (err) {
    process.stderr.write(`[auto-dev] ERROR: ${err.message}\n`);
    process.exit(1);
  }
})();
