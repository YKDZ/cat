import { runBootstrapOnly } from "./bootstrap-only.ts";

void runBootstrapOnly()
  .then((receipt) => {
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
