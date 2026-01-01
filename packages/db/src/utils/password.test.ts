// password.test.ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("Password Utilities", () => {
  const TEST_PASSWORD = "my-super-secret-password";
  const WRONG_PASSWORD = "wrong-password";

  describe("hashPassword", () => {
    it('should return a string in "salt:hash" format', async () => {
      const result = await hashPassword(TEST_PASSWORD);

      expect(typeof result).toBe("string");
      expect(result).toContain(":");

      const parts = result.split(":");
      expect(parts).toHaveLength(2);

      const [salt, hash] = parts;
      // 检查 salt 和 hash 是否为有效的 hex 字符串
      expect(salt).toMatch(/^[0-9a-f]+$/);
      expect(hash).toMatch(/^[0-9a-f]+$/);
      // 检查 salt 长度 (16 bytes = 32 hex chars)
      expect(salt.length).toBe(32);
      // 检查 hash 长度 (64 bytes = 128 hex chars for sha512)
      expect(hash.length).toBe(128);
    });

    it("should generate different salts for the same password", async () => {
      const result1 = await hashPassword(TEST_PASSWORD);
      const result2 = await hashPassword(TEST_PASSWORD);

      expect(result1).not.toBe(result2);

      const [salt1] = result1.split(":");
      const [salt2] = result2.split(":");
      expect(salt1).not.toBe(salt2);
    });

    it("should handle empty password string", async () => {
      const result = await hashPassword("");
      expect(result).toBeTruthy();
      expect(result.split(":")).toHaveLength(2);
    });
  });

  describe("verifyPassword", () => {
    it("should return true for the correct password", async () => {
      const storedHash = await hashPassword(TEST_PASSWORD);
      const isValid = await verifyPassword(TEST_PASSWORD, storedHash);

      expect(isValid).toBe(true);
    });

    it("should return false for an incorrect password", async () => {
      const storedHash = await hashPassword(TEST_PASSWORD);
      const isValid = await verifyPassword(WRONG_PASSWORD, storedHash);

      expect(isValid).toBe(false);
    });

    it("should return false if the stored hash format is invalid (missing colon)", async () => {
      const invalidHash = "invalidhashstringwithoutcolon";
      const isValid = await verifyPassword(TEST_PASSWORD, invalidHash);

      expect(isValid).toBe(false);
    });

    it("should return false if the stored hash format is invalid (empty parts)", async () => {
      const invalidHash = ":";
      const isValid = await verifyPassword(TEST_PASSWORD, invalidHash);

      expect(isValid).toBe(false);
    });

    it("should return false if the hash component length does not match", async () => {
      const storedHash = await hashPassword(TEST_PASSWORD);
      const [salt, hash] = storedHash.split(":");

      // 人为修改 hash 的长度（去掉最后一个字符）
      const tamperedHash = `${salt}:${hash.slice(0, -1)}`;

      const isValid = await verifyPassword(TEST_PASSWORD, tamperedHash);
      expect(isValid).toBe(false);
    });

    it("should return false if the salt is tampered with", async () => {
      const storedHash = await hashPassword(TEST_PASSWORD);
      const [salt, hash] = storedHash.split(":");

      // 修改 salt 的某一位
      const tamperedSalt = salt.replace(salt[0], salt[0] === "a" ? "b" : "a");
      const tamperedHash = `${tamperedSalt}:${hash}`;

      const isValid = await verifyPassword(TEST_PASSWORD, tamperedHash);
      expect(isValid).toBe(false);
    });
  });
});
