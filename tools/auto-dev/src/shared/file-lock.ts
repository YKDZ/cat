import { open, unlink } from "node:fs/promises";

const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 5000;

/**
 * Acquire a file lock using a lock file.
 */
export const acquireLock = async (
  filePath: string,
): Promise<() => Promise<void>> => {
  const lockPath = `${filePath}.lock`;
  const startedAt = Date.now();

  while (true) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      const handle = await open(lockPath, "wx");
      // oxlint-disable-next-line no-await-in-loop
      await handle.close();

      return async () => {
        try {
          await unlink(lockPath);
        } catch {
          // Lock file already removed
        }
      };
    } catch {
      if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        throw new Error(
          `Timed out waiting for lock on ${filePath} after ${LOCK_TIMEOUT_MS}ms`,
        );
      }
      // oxlint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }
};
