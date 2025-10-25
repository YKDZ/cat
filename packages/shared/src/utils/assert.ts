export class AssertError extends Error {
  constructor(
    public override message: string,
    public leadTo?: unknown,
  ) {
    super(message);
    this.name = "AssertError";
  }
}

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

export const assertFirstNonNullish = <T>(arr: T[]): T => {
  if (arr.length === 0) {
    throw new AssertError(
      `Expected first element in array, but array is empty.`,
    );
  }
  if (arr[0] === null || arr[0] === undefined) {
    throw new AssertError(
      `Expected first element in array to be non-nullish, but got ${JSON.stringify(arr[0])}. ${JSON.stringify(arr)}`,
    );
  }
  return arr[0];
};

export const assertSingleNonNullish = <T>(arr: T[]): T => {
  if (arr.length !== 1) {
    throw new AssertError(
      `Expected array of length 1, but got length ${arr.length}. ${JSON.stringify(arr)}`,
    );
  }
  if (arr[0] === null || arr[0] === undefined) {
    throw new AssertError(
      `Expected only element in array to be non-nullish, but got ${JSON.stringify(arr[0])}. ${JSON.stringify(arr)}`,
    );
  }
  return arr[0];
};
