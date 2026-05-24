// oxlint-disable no-console -- intentional diagnostic logging in globalTeardown
import { execSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Playwright global teardown.
 *
 * When `E2E_COMPOSE_TEARDOWN=true`, shuts down the E2E docker-compose stack
 * that was started manually before the test run.  Leave the variable unset
 * during iterative local development so containers are reused between runs.
 */
export default async function globalTeardown(): Promise<void> {
  if (process.env.E2E_COMPOSE_TEARDOWN !== "true") return;

  const composePath = resolve(import.meta.dirname, "docker-compose.yml");
  console.log("[e2e globalTeardown] Stopping E2E docker-compose stack…");
  try {
    execSync(`docker compose -f "${composePath}" down`, { stdio: "inherit" });
    console.log("[e2e globalTeardown] Stack stopped.");
  } catch (err) {
    console.warn(
      "[e2e globalTeardown] docker compose down failed (non-fatal):",
      err,
    );
  }
}
