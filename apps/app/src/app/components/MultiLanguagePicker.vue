<script setup lang="ts">
import { useInfiniteQuery } from "@pinia/colada";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/app/rpc/orpc";

import type { PickerOption } from "./picker/index.ts";

import MultiPicker from "./picker/MultiPicker.vue";

const props = withDefaults(
  defineProps<{
    filter?: (option: PickerOption) => boolean;
    portal?: boolean;
  }>(),
  {
    filter: () => true,
    portal: true,
  },
);

const { t } = useI18n();

const languageIds = defineModel<string[]>({ default: [] });
const search = ref("");

const { state, loadNextPage } = useInfiniteQuery({
  key: () => ["languages", search.value],
  query: ({ pageParam }) =>
    orpc.language.getAll({
      searchQuery: search.value,
      page: Number(pageParam),
    }),
  initialPageParam: 0,
  getNextPageParam: (lastPage, _1, lastPageParam) => {
    if (lastPage.hasMore) {
      return Number(lastPageParam) + 1;
    }
    return undefined;
  },
});

const options = computed(() => {
  const pages = state.value?.data?.pages;
  if (!pages) return [];

  const fromPages = pages
    .flatMap((page) => page.languages)
    .map((language) => ({
      value: language.id,
      content: t(language.id),
    }))
    .filter((language) => props.filter(language));

  // Ensure pre-selected values always appear in the options list,
  // even when they fall outside the current paginated page.
  const known = new Set(fromPages.map((o) => o.value));
  const extras = languageIds.value
    .filter((id) => !known.has(id))
    .map((id) => ({ value: id, content: t(id) }));

  return [...extras, ...fromPages];
});
</script>

<template>
  <MultiPicker
    v-model="languageIds"
    v-model:search="search"
    :options
    :placeholder="$t('选择一个或多个语言')"
    :load-more="() => loadNextPage()"
    :portal="props.portal"
  />
</template>
