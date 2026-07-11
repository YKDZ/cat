import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password.ts";

const splitStoredHash = (storedHash: string): [string, string] => {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) throw new Error("Expected a salt and hash");
  return [salt, hash];
};

describe("Password Utilities", () => {
  const TEST_PASSWORD = "my-super-secret-password";
  const WRONG_PASSWORD = "wrong-password";

  describe("hashPassword", () => {
    it('should return a string in "salt:hash" format', async () => {
      const result = await hashPassword(TEST_PASSWORD);

      expect(typeof result).toBe("string");
      expect(result).toContain(":");

      const [salt, hash] = splitStoredHash(result);
      expect(salt).toMatch(/^[0-9a-f]+$/);
      expect(hash).toMatch(/^[0-9a-f]+$/);
      expect(salt.length).toBe(32);
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
      const [salt, hash] = splitStoredHash(storedHash);

      const tamperedHash = `${salt}:${hash.slice(0, -1)}`;

      const isValid = await verifyPassword(TEST_PASSWORD, tamperedHash);
      expect(isValid).toBe(false);
    });

    it("should return false if the salt is tampered with", async () => {
      const storedHash = await hashPassword(TEST_PASSWORD);
      const [salt, hash] = splitStoredHash(storedHash);

      const firstCharacter = salt[0];
      if (!firstCharacter) throw new Error("Expected a non-empty salt");
      const tamperedSalt = salt.replace(
        firstCharacter,
        firstCharacter === "a" ? "b" : "a",
      );
      const tamperedHash = `${tamperedSalt}:${hash}`;

      const isValid = await verifyPassword(TEST_PASSWORD, tamperedHash);
      expect(isValid).toBe(false);
    });
  });
});
