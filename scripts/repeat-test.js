import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const CONFIG = {
  command: "nx test app-workers --skip-nx-cache",
  totalRuns: 3,
  maxBuffer: 1024 * 1024 * 10,
};

const run = async () => {
  let fails = 0;

  console.log(`Starting ${CONFIG.totalRuns} runs for: ${CONFIG.command}\n`);

  for (let i = 1; i <= CONFIG.totalRuns; i += 1) {
    process.stdout.write(`Run ${i}: `);

    try {
      await execAsync(CONFIG.command, {
        maxBuffer: CONFIG.maxBuffer,
      });

      console.log("✅ Pass");
    } catch (error) {
      console.log("❌ Fail");

      console.log("---------------- ERROR LOG START ----------------");
      if (error.stdout) console.log(error.stdout);
      if (error.stderr) console.error(error.stderr);
      console.log("----------------- ERROR LOG END -----------------");

      fails++;
    }
  }

  console.log(`\nTotal Failures: ${fails} / ${CONFIG.totalRuns}`);

  if (fails > 0) {
    process.exit(1);
  }
};

await run();
