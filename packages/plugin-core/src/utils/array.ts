import { isEqual } from "lodash-es";

export const haveSameObjects = <T>(a: T[], b: T[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((objA) => b.some((objB) => isEqual(objA, objB)));
};
