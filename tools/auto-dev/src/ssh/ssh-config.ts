import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

export const generateSSHConfig = (): void => {
  const publicKey = process.env.SSH_PUBLIC_KEY;
  const password = process.env.SSH_PASSWORD;

  if (publicKey) {
    mkdirSync("/root/.ssh", { recursive: true });
    writeFileSync("/root/.ssh/authorized_keys", publicKey.trim() + "\n", {
      mode: 0o600,
    });
    console.log("[auto-dev] SSH public key authorized");
  }

  if (password) {
    execSync(`echo "root:${password}" | chpasswd`);
    console.log("[auto-dev] SSH password authentication enabled");
  }

  if (!publicKey && !password) {
    console.warn(
      "[auto-dev] No SSH_PUBLIC_KEY or SSH_PASSWORD set. SSH access unavailable. Use docker exec to enter container.",
    );
  }
};
