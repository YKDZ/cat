import { describe, it, expect } from "vitest";
import {
  chunkGenerator,
  dualChunkGenerator,
  chunk,
  chunkDual,
  getIndex,
  zip,
} from "./array.ts"; // 替换为实际文件名

describe("Array Utility Functions", () => {
  describe("chunkGenerator", () => {
    it("should chunk an array into smaller arrays of given size", () => {
      const gen = chunkGenerator([1, 2, 3, 4, 5], 2);
      expect(gen.next().value).toEqual([1, 2]);
      expect(gen.next().value).toEqual([3, 4]);
      expect(gen.next().value).toEqual([5]);
      expect(gen.next().done).toBe(true);
    });

    it("should handle empty arrays", () => {
      const gen = chunkGenerator([], 2);
      expect(gen.next().done).toBe(true);
    });
  });

  describe("dualChunkGenerator", () => {
    it("should synchronously chunk two arrays", () => {
      const arr1 = ["a", "b", "c"];
      const arr2 = [1, 2, 3];
      const gen = dualChunkGenerator(arr1, arr2, 2);

      expect(gen.next().value).toEqual([
        ["a", "b"],
        [1, 2],
      ]);
      expect(gen.next().value).toEqual([["c"], [3]]);
      expect(gen.next().done).toBe(true);
    });

    it("should use the shorter array length as the loop termination condition when array lengths differ", () => {
      // arr1 length is 3, arr2 length is 1, min length is 1
      const gen = dualChunkGenerator([1, 2, 3], ["a"], 2);

      // First iteration: i=0, size=2. arr1.slice(0, 2) is [1, 2]
      expect(gen.next().value).toEqual([[1, 2], ["a"]]);

      // Second iteration: i=2, no longer less than min length 1, end
      expect(gen.next().done).toBe(true);
    });
  });

  describe("chunk", () => {
    it("should return an array of chunk objects with indices", () => {
      const result = chunk([10, 20, 30], 2);
      expect(result).toEqual([
        { index: 0, chunk: [10, 20] },
        { index: 1, chunk: [30] },
      ]);
    });

    it("should return single block when chunk size is larger than array length", () => {
      expect(chunk([1], 5)).toHaveLength(1);
    });
  });

  describe("chunkDual", () => {
    it("should correctly merge chunks of two arrays of equal length", () => {
      const r = chunkDual([1, 2], ["a", "b"], 1);
      expect(r).toHaveLength(2);
      expect(r[0].chunk).toEqual({ arr1: [1], arr2: ["a"] });
    });

    it("should throw an error when array lengths do not match", () => {
      expect(() => chunkDual([1], [1, 2], 1)).toThrow(
        /Arrays must be of the same length/,
      );
    });
  });

  describe("getIndex", () => {
    it("should return the correct index value", () => {
      expect(getIndex([10, 20], 1)).toBe(20);
    });

    it("should throw an error when index is out of bounds", () => {
      expect(() => getIndex([1], 5)).toThrow(/out of bounds/);
    });

    it("should also throw an error when the value at the index is falsy (e.g., undefined)", () => {
      expect(() => {
        getIndex([undefined], 0);
      }).toThrow();
    });
  });

  describe("zip", () => {
    it("should zip multiple arrays", () => {
      const a = [1, 2];
      const b = ["a", "b"];
      const c = [true, false];
      const result = Array.from(zip(a, b, c));

      expect(result).toEqual([
        [1, "a", true],
        [2, "b", false],
      ]);
    });

    it("should throw an error when input arrays have different lengths", () => {
      expect(() => Array.from(zip([1, 2], [1]))).toThrow(
        "Array length mismatch",
      );
    });

    it("should handle empty arguments or empty arrays", () => {
      const result = Array.from(zip());
      expect(result).toEqual([]);

      const result2 = Array.from(zip([], []));
      expect(result2).toEqual([]);
    });

    it("should verify the iterator protocol", () => {
      const iterator = zip([1], ["a"])[Symbol.iterator]();
      expect(iterator.next()).toEqual({ value: [1, "a"], done: false });
      expect(iterator.next()).toEqual({ value: undefined, done: true });
    });
  });
});
