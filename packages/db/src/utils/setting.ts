import { prisma } from "../prisma";

export const setting = async <T>(key: string, fallback: T): Promise<T> => {
  const data = await prisma.setting.findUnique({
    where: {
      key,
    },
    select: {
      value: true,
    },
  });
  return data ? (data.value as T) : fallback;
};

export const settings = async (
  prefix: string,
): Promise<Record<string, unknown>> => {
  const datas = await prisma.setting.findMany({
    where: {
      key: {
        startsWith: prefix,
      },
    },
    select: {
      key: true,
      value: true,
    },
  });

  const settings: Record<string, unknown> = {};
  datas.forEach(({ key, value }) => {
    settings[key] = value;
  });
  return settings;
};
