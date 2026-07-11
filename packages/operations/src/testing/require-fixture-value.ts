export const requireFixtureValue = <T>(
  value: T | null | undefined,
): NonNullable<T> => {
  if (value === null || value === undefined) {
    throw new Error("Expected fixture value to be defined");
  }
  return value;
};
