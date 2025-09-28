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
  for (let i = 0; i < chunkCount; i++) {
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
  return arr[index]!;
};

export const zip = <T, U>(a: T[], b: U[]): [T, U][] => {
  if (a.length !== b.length) throw new Error("length mismatch");
  return a.map((x, i) => [x, b[i]] as [T, U]);
};
