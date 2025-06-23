import { spawn } from "child_process";
import * as readline from "readline";

export const runCommand = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<string | undefined> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      ...options,
    });

    const rl = readline.createInterface({ input: child.stdout });

    let extractedPassword: string | undefined;

    rl.on("line", (line) => {
      console.log(line);
    });

    child.stderr.on("data", (data) => {
      console.error(`${data}`);
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
      } else {
        resolve(extractedPassword);
      }
    });
  });
};
