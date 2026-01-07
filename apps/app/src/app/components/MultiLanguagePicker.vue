<script setup lang="ts">
import { computed, ref } from "vue";
import type { PickerOption } from "./picker/index.ts";
import MultiPicker from "./picker/MultiPicker.vue";
import { useI18n } from "vue-i18n";
import { orpc } from "@/server/orpc";
import { useInfiniteQuery } from "@pinia/colada";

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

  return pages
    .flatMap((page) => page.languages)
    .map((language) => {
      return {
        value: language.id,
        content: t(language.id),
      };
    })
    .filter((language) => props.filter(language));
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
