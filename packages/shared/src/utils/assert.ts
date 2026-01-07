export class AssertError extends Error {
  constructor(
    public override message: string,
    public leadTo?: unknown,
  ) {
    super(message);
    this.name = "AssertError";
  }
}

export const assertFirstOrNull = <T>(arr: T[], message?: string): T | null => {
  if (arr.length === 0) {
    return null;
  }
  if (arr[0] === null || arr[0] === undefined) {
    throw new AssertError(
      message ??
        `Expected first element in array to be non-nullish, but got ${JSON.stringify(arr[0])}. ${arrayPreview(arr)}`,
    );
  }
  return arr[0];
};

export const assertSingleOrNull = <T>(arr: T[], message?: string): T | null => {
  if (arr.length === 0) {
    return null;
  }
  if (arr.length !== 1) {
    throw new AssertError(
      message ??
        `Expected array of length 1, but got length ${arr.length}. ${arrayPreview(arr)}`,
    );
  }
  if (arr[0] === null || arr[0] === undefined) {
    throw new AssertError(
      message ??
        `Expected only element in array to be non-nullish, but got ${JSON.stringify(arr[0])}. ${arrayPreview(arr)}`,
    );
  }
  return arr[0];
};

export const assertPromise = async (
  predicate: () => Promise<unknown>,
  message: string,
): Promise<void> => {
  try {
    await predicate();
  } catch (e) {
    throw new AssertError(message, e);
  }
};

export const assertFirstNonNullish = <T>(arr: T[], message?: string): T => {
  if (arr.length === 0) {
    throw new AssertError(
      message ?? `Expected first element in array, but array is empty.`,
    );
  }
  if (arr[0] === null || arr[0] === undefined) {
    throw new AssertError(
      message ??
        `Expected first element in array to be non-nullish, but got ${JSON.stringify(arr[0])}. ${arrayPreview(arr)}`,
    );
  }
  return arr[0];
};

export const assertSingleNonNullish = <T>(arr: T[], message?: string): T => {
  if (arr.length !== 1) {
    throw new AssertError(
      message ??
        `Expected array of length 1, but got length ${arr.length}. ${arrayPreview(arr)}`,
    );
  }
  if (arr[0] === null || arr[0] === undefined) {
    throw new AssertError(
      message ??
        `Expected only element in array to be non-nullish, but got ${JSON.stringify(arr[0])}. ${arrayPreview(arr)}`,
    );
  }
  return arr[0];
};

export const assertKeysNonNullish = <T, K extends keyof T>(
  obj: T,
  keys: readonly K[],
  message?: string,
): asserts obj is T & { [P in K]-?: Exclude<T[P], null | undefined> } => {
  for (const key of keys) {
    const value = obj[key];
    if (value === null || value === undefined) {
      throw new Error(message ?? `Expected ${String(key)} to be non-nullish`);
    }
  }
};

const arrayPreview = <T>(arr: T[], previewKeys: (keyof T)[] = []): string => {
  if (arr.length === 0) return "[]";
  return (
    arr
      .slice(0, 3)
      .map((item) => {
        if (!item || typeof item !== "object") return String(item);
        const preview: Partial<Record<keyof T, unknown>> = {};
        for (const key of previewKeys) {
          preview[key] = item[key];
        }
        return JSON.stringify(preview);
      })
      .join(", ") + (arr.length > 3 ? ", ..." : "")
  );
};
