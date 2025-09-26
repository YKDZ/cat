import type {
  PluginRegistry,
  StorageProvider,
  TranslatableFileHandler,
} from "@cat/plugin-core";
import type { TranslatableElementData } from "@cat/shared/schema/misc";
import type { JSONType } from "@cat/shared/schema/json";
import { OverallDrizzleClient } from "@cat/db";
import { getServiceFromDBId } from "@/utils/plugin.ts";

export const extractElementsFromFile = async (
  drizzle: OverallDrizzleClient,
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
  const dbFile = await drizzle.query.file.findFirst({
    where: (file, { eq }) => eq(file.id, fileId),
    columns: {
      storageProviderId: true,
      storedPath: true,
    },
  });

  if (!dbFile) throw new Error("File not found");

  const provider = await getServiceFromDBId<StorageProvider>(
    drizzle,
    pluginRegistry,
    dbFile.storageProviderId,
  );

  const fileContent = await provider.getContent(dbFile.storedPath);

  const newElements = sortAndAssignIndex(
    await handler.extractElement(fileContent),
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
