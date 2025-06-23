import { test as setup } from "@playwright/test";
import { runCommand } from "../utils/command";

setup("reset db", async () => {
  await runCommand("pnpm", [
    "prisma",
    "migrate",
    "reset",
    "--skip-generate",
    "--force",
  ]);
});
