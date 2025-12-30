export function* chunkGenerator<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) {
    yield arr.slice(i, i + size);
  }
}

export function* dualChunkGenerator<A, B>(
  arr1: A[],
  arr2: B[],
  size: number,
): Generator<[A[], B[]]> {
  const length = Math.min(arr1.length, arr2.length);
  for (let i = 0; i < length; i += size) {
    yield [arr1.slice(i, i + size), arr2.slice(i, i + size)];
  }
}

export function chunk<T>(
  arr: T[],
  size: number,
): {
  index: number;
  chunk: T[];
}[] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => {
    return { index: i, chunk: arr.slice(i * size, (i + 1) * size) };
  });
}

export function chunkDual<A, B>(
  arr1: A[],
  arr2: B[],
  size: number,
): {
  index: number;
  chunk: {
    arr1: A[];
    arr2: B[];
  };
}[] {
  if (arr1.length !== arr2.length)
    throw new Error(
      "Arrays must be of the same length. But given arr1 length: " +
        arr1.length +
        " and arr2 length: " +
        arr2.length,
    );

  const result: {
    index: number;
    chunk: {
      arr1: A[];
      arr2: B[];
    };
  }[] = [];

  const chunkCount = Math.ceil(arr1.length / size);
  for (let i = 0; i < chunkCount; i += 1) {
    const start = i * size;
    const end = start + size;
    result.push({
      index: i,
      chunk: {
        arr1: arr1.slice(start, end),
        arr2: arr2.slice(start, end),
      },
    });
  }

  return result;
}

export const getIndex = <T>(arr: T[], index: number): T => {
  if (index >= arr.length || !arr[index]) {
    throw new Error(
      `Index ${index} is out of bounds for array of length ${arr.length}`,
    );
  }
  return arr[index];
};

type RowOf<T extends readonly unknown[][]> = {
  [K in keyof T]: T[K][number];
};

const isRow = <T extends readonly unknown[][]>(
  row: readonly unknown[],
  arrays: T,
): row is RowOf<T> => row.length === arrays.length;

/**
 * 输入任意个长度相同的数组 a, b, c...
 * 输出由每个数组同一位置元素组成的数组的迭代器
 */
export const zip = <T extends readonly unknown[][]>(
  ...arrays: T
): Iterable<RowOf<T>> => {
  const len = arrays[0]?.length ?? 0;

  for (const arr of arrays) {
    if (arr.length !== len) {
      throw new Error("Array length mismatch");
    }
  }

  let i = 0;

  return {
    [Symbol.iterator]: () => ({
      next: () => {
        if (i >= len) {
          return { value: undefined, done: true as const };
        }

        const row = arrays.map((a) => a[i]);
        i += 1;

        if (!isRow(row, arrays)) {
          throw new Error("Unexpected shape");
        }

        return { value: row, done: false as const };
      },
    }),
  };
};
