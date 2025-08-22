import { diffArrays } from "diff";

export const diffArraysAndSeparate = <T>(
  elementsA: T[],
  elementsB: T[],
  comparator: (a: T, b: T) => boolean,
): {
  added: T[];
  removed: T[];
} => {
  const added: T[] = [];
  const removed: T[] = [];

  const diff = diffArrays<T>(elementsA, elementsB, {
    comparator,
  });
  diff.forEach((object) => {
    if (object.added) {
      added.push(...object.value);
    } else if (object.removed) {
      removed.push(...object.value);
    }
  });

  return { added, removed };
};
