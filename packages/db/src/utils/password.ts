import { randomBytes, pbkdf2, timingSafeEqual } from "crypto";

export const hashPassword = (password: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString("hex");
    pbkdf2(password, salt, 1024, 64, "sha512", (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
};

export const verifyPassword = (
  password: string,
  storedSaltHash: string,
): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    try {
      const [salt, keyHex] = storedSaltHash.split(":");
      if (!salt || !keyHex) return resolve(false);
      const keyBuffer = Buffer.from(keyHex, "hex");
      pbkdf2(
        password,
        salt,
        1024,
        keyBuffer.length,
        "sha512",
        (err, derivedKey) => {
          if (err) return reject(err);
          if (derivedKey.length !== keyBuffer.length) {
            return resolve(false);
          }
          const isMatch = timingSafeEqual(keyBuffer, derivedKey);
          resolve(isMatch);
        },
      );
    } catch (err) {
      reject(err);
    }
  });
};
