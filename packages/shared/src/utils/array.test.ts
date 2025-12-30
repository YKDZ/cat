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
    it("应该将数组按大小分块生成", () => {
      const gen = chunkGenerator([1, 2, 3, 4, 5], 2);
      expect(gen.next().value).toEqual([1, 2]);
      expect(gen.next().value).toEqual([3, 4]);
      expect(gen.next().value).toEqual([5]);
      expect(gen.next().done).toBe(true);
    });

    it("处理空数组", () => {
      const gen = chunkGenerator([], 2);
      expect(gen.next().done).toBe(true);
    });
  });

  describe("dualChunkGenerator", () => {
    it("应该同步对两个数组进行分块", () => {
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

    it("当数组长度不一致时，应以较短的数组长度作为循环终止条件", () => {
      // arr1 长度为 3，arr2 长度为 1，min 长度为 1
      const gen = dualChunkGenerator([1, 2, 3], ["a"], 2);

      // 第一次迭代：i=0, size=2。arr1.slice(0, 2) 是 [1, 2]
      expect(gen.next().value).toEqual([[1, 2], ["a"]]);

      // 第二次迭代：i=2, 不再小于 min 长度 1，结束
      expect(gen.next().done).toBe(true);
    });
  });

  describe("chunk", () => {
    it("应该返回带有索引的分块对象数组", () => {
      const result = chunk([10, 20, 30], 2);
      expect(result).toEqual([
        { index: 0, chunk: [10, 20] },
        { index: 1, chunk: [30] },
      ]);
    });

    it("size 大于数组长度时返回单块", () => {
      expect(chunk([1], 5)).toHaveLength(1);
    });
  });

  describe("chunkDual", () => {
    it("应该正确合并两个等长数组的分块", () => {
      const r = chunkDual([1, 2], ["a", "b"], 1);
      expect(r).toHaveLength(2);
      expect(r[0].chunk).toEqual({ arr1: [1], arr2: ["a"] });
    });

    it("当数组长度不匹配时应该抛出错误", () => {
      expect(() => chunkDual([1], [1, 2], 1)).toThrow(
        /Arrays must be of the same length/,
      );
    });
  });

  describe("getIndex", () => {
    it("应该返回正确的索引值", () => {
      expect(getIndex([10, 20], 1)).toBe(20);
    });

    it("索引越界时抛出错误", () => {
      expect(() => getIndex([1], 5)).toThrow(/out of bounds/);
    });

    it("对应位置为 falsy 值（如 undefined）时也应抛错", () => {
      expect(() => {
        getIndex([undefined], 0);
      }).toThrow();
    });
  });

  describe("zip", () => {
    it("应该像拉链一样组合多个数组", () => {
      const a = [1, 2];
      const b = ["a", "b"];
      const c = [true, false];
      const result = Array.from(zip(a, b, c));

      expect(result).toEqual([
        [1, "a", true],
        [2, "b", false],
      ]);
    });

    it("当输入数组长度不一致时抛出错误", () => {
      expect(() => Array.from(zip([1, 2], [1]))).toThrow(
        "Array length mismatch",
      );
    });

    it("处理空参数或空数组", () => {
      const result = Array.from(zip());
      expect(result).toEqual([]);

      const result2 = Array.from(zip([], []));
      expect(result2).toEqual([]);
    });

    it("验证迭代器协议", () => {
      const iterator = zip([1], ["a"])[Symbol.iterator]();
      expect(iterator.next()).toEqual({ value: [1, "a"], done: false });
      expect(iterator.next()).toEqual({ value: undefined, done: true });
    });
  });
});
