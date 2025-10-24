import { OverallDrizzleClient, vector } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { UnvectorizedTextData } from "@cat/shared/schema/misc";

export const vectorizeWithGivenVectorizer = async (
  drizzle: OverallDrizzleClient,
  pluginRegistry: PluginRegistry,
  vectorizerId: number,
  data: UnvectorizedTextData[],
): Promise<number[]> => {
  const dataWithIndex = data.map((item, index) => ({
    ...item,
    originalIndex: index,
  }));

  const grouped = Object.groupBy(dataWithIndex, (t) => t.languageId);

  const filtered = Object.fromEntries(
    Object.entries(grouped).filter(([, value]) => value && value.length),
  );

  const vectorizer =
    await pluginRegistry.getPluginServiceWithDBId<"TEXT_VECTORIZER">(
      drizzle,
      vectorizerId,
    );

  if (!vectorizer)
    throw new Error(`No vectorizer found with ID ${vectorizerId}`);

  const vectorDataWithIndex = (
    await Promise.all(
      Object.entries(filtered).map(async ([languageId, group]) => {
        if (!group || !group.length) return [];

        if (!vectorizer.service.canVectorize(languageId))
          throw new Error(
            `Vectorizer ${vectorizer.id} cannot vectorize language ${languageId}`,
          );

        const vectors = await vectorizer.service.vectorize(group);

        return group.map((item, i) => ({
          vector: vectors[i],
          vectorizerId: vectorizer.id,
          meta: { languageId },
          originalIndex: item.originalIndex,
        }));
      }),
    )
  ).flat();

  vectorDataWithIndex.sort((a, b) => a.originalIndex - b.originalIndex);

  const result = await drizzle
    .insert(vector)
    .values(vectorDataWithIndex)
    .returning({ id: vector.id });

  return result.map((r) => r.id);
};

export const vectorize = async (
  drizzle: OverallDrizzleClient,
  pluginRegistry: PluginRegistry,
  data: UnvectorizedTextData[],
): Promise<number[]> => {
  const dataWithIndex = data.map((item, index) => ({
    ...item,
    originalIndex: index,
  }));

  const grouped = Object.groupBy(dataWithIndex, (t) => t.languageId);

  const filtered = Object.fromEntries(
    Object.entries(grouped).filter(([, value]) => value && value.length),
  );

  const vectorizers = await pluginRegistry.getPluginServices(
    drizzle,
    "TEXT_VECTORIZER",
  );

  const vectorDataWithIndex = (
    await Promise.all(
      Object.entries(filtered).map(async ([languageId, group]) => {
        if (!group || !group.length) return [];

        const vectorizer = vectorizers.find(({ service }) =>
          service.canVectorize(languageId),
        );
        if (!vectorizer)
          throw new Error(`No vectorizer found for language ${languageId}`);

        const vectors = await vectorizer.service.vectorize(group);

        return group.map((item, i) => ({
          vector: vectors[i],
          vectorizerId: vectorizer.id,
          meta: { languageId },
          originalIndex: item.originalIndex,
        }));
      }),
    )
  ).flat();

  vectorDataWithIndex.sort((a, b) => a.originalIndex - b.originalIndex);

  const result = await drizzle
    .insert(vector)
    .values(vectorDataWithIndex)
    .returning({ id: vector.id });

  return result.map((r) => r.id);
};
