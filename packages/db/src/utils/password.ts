import { randomBytes, pbkdf2, timingSafeEqual } from "node:crypto";

export const hashPassword = async (password: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString("hex");
    pbkdf2(password, salt, 1024, 64, "sha512", (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
};

export const verifyPassword = async (
  password: string,
  storedSaltHash: string,
): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    try {
      const [salt, keyHex] = storedSaltHash.split(":");
      if (!salt || !keyHex) {
        resolve(false);
        return;
      }
      const keyBuffer = Buffer.from(keyHex, "hex");
      pbkdf2(
        password,
        salt,
        1024,
        keyBuffer.length,
        "sha512",
        (err, derivedKey) => {
          if (err) {
            reject(err);
            return;
          }
          if (derivedKey.length !== keyBuffer.length) {
            resolve(false);
            return;
          }
          const isMatch = timingSafeEqual(keyBuffer, derivedKey);
          resolve(isMatch);
        },
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
};
