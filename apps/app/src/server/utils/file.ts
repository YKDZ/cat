import type {
  PluginRegistry,
  StorageProvider,
  TranslatableFileHandler,
} from "@cat/plugin-core";
import type { TranslatableElementData } from "@cat/shared/schema/misc";
import type { OverallPrismaClient } from "@cat/db";
import type { JSONType } from "@cat/shared/schema/json";
import { getServiceFromDBId } from "@/server/utils/plugin.ts";

export const extractElementsFromFile = async (
  prisma: OverallPrismaClient,
  pluginRegistry: PluginRegistry,
  handler: TranslatableFileHandler,
  fileId: number,
): Promise<
  {
    value: string;
    meta: JSONType;
    sortIndex: number;
  }[]
> => {
  const dbFile = await prisma.file.findUniqueOrThrow({
    where: {
      id: fileId,
    },
    select: {
      storageProviderId: true,
    },
  });

  const provider = await getServiceFromDBId<StorageProvider>(
    prisma,
    pluginRegistry,
    dbFile.storageProviderId,
  );

  const file = await prisma.file.findUniqueOrThrow({
    where: {
      id: fileId,
    },
  });

  const fileContent = await provider.getContent(file);

  const newElements = sortAndAssignIndex(
    await handler.extractElement(file, fileContent),
  );

  return newElements;
};

const sortAndAssignIndex = (
  elements: TranslatableElementData[],
): (TranslatableElementData & { sortIndex: number })[] => {
  const withSortIndex: (TranslatableElementData & { sortIndex: number })[] = [];
  const withoutSortIndex: {
    item: TranslatableElementData;
    originalIndex: number;
  }[] = [];

  elements.forEach((item, idx) => {
    if (typeof item.sortIndex === "number") {
      withSortIndex.push(
        item as TranslatableElementData & { sortIndex: number },
      );
    } else {
      withoutSortIndex.push({ item, originalIndex: idx });
    }
  });

  withSortIndex.sort((a, b) => a.sortIndex! - b.sortIndex!);

  const maxSortIndex =
    withSortIndex.length > 0
      ? Math.max(...withSortIndex.map((i) => i.sortIndex!))
      : -1;

  let currentIndex = maxSortIndex + 1;
  const assignedWithoutSortIndex = withoutSortIndex
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map(({ item }) => ({
      ...item,
      sortIndex: currentIndex++,
    }));

  return [...withSortIndex, ...assignedWithoutSortIndex];
};
