type ExactOptionalProps<T extends object> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<
    T[K],
    undefined
  >;
};

export const exactOptionalProps = <T extends object>(
  props: T,
): ExactOptionalProps<T> =>
  // This adapter's return type mirrors the runtime removal of undefined keys.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== undefined),
  ) as ExactOptionalProps<T>;
