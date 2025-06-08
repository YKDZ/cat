import { randomBytes } from "node:crypto";

export const randomChars = (size: number = 16) => {
  return randomBytes(size).toString("hex");
};
