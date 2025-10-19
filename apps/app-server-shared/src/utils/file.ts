import type {
  PluginRegistry,
  StorageProvider,
  TranslatableFileHandler,
} from "@cat/plugin-core";
import type {
  TranslatableElementData,
  TranslatableElementDataWithoutLanguageId,
} from "@cat/shared/schema/misc";
import { OverallDrizzleClient } from "@cat/db";
import { getServiceFromDBId } from "@/utils/plugin.ts";

export const extractElementsFromFile = async (
  drizzle: OverallDrizzleClient,
  pluginRegistry: PluginRegistry,
  handler: TranslatableFileHandler,
  fileId: number,
): Promise<TranslatableElementDataWithoutLanguageId[]> => {
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
  elements: TranslatableElementDataWithoutLanguageId[],
): (TranslatableElementDataWithoutLanguageId & { sortIndex: number })[] => {
  const withSortIndex: (TranslatableElementDataWithoutLanguageId & {
    sortIndex: number;
  })[] = [];
  const withoutSortIndex: {
    item: TranslatableElementDataWithoutLanguageId;
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
      sortIndex: (currentIndex += 1),
    }));

  return [...withSortIndex, ...assignedWithoutSortIndex];
};
