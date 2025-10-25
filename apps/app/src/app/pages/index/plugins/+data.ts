export const data = () => {
  return { plugins: [] };
};

export type Data = Awaited<ReturnType<typeof data>>;
