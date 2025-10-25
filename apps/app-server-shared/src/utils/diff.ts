import { diffArrays } from "diff";

// 两个没有 extends 关系的对象被视为不可以
// 也就没有 diff 的意义
// 同时 diffArrays 也不接受两个泛型参数
export const diffArraysAndSeparate = <T extends K, K>(
  elementsA: T[],
  elementsB: K[],
  comparator: (a: K, b: K) => boolean,
): {
  added: K[];
  removed: T[];
} => {
  const added: K[] = [];
  const removed: T[] = [];

  const diff = diffArrays<K>(elementsA, elementsB, {
    comparator,
  });

  diff.forEach((object) => {
    if (object.added) {
      added.push(...object.value);
    } else if (object.removed) {
      // oxlint-disable-next-line no-unsafe-type-assertion
      removed.push(...(object.value as T[]));
    }
  });

  return { added, removed };
};
