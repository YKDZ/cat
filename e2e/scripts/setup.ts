import { runCommand } from "../utils/command";

const main = async () => {
  try {
    console.log("[STEP 1] Running Prisma DB Migrate...");
    await runCommand("pnpm", [
      "prisma",
      "migrate",
      "reset",
      "--skip-generate",
      "--force",
    ]);
  } catch (error) {
    console.error("[ERROR]", error);
    process.exit(1);
  }
};

main();
