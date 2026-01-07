<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import Picker from "@/app/components/picker/Picker.vue";
import { orpc } from "@/server/orpc";
import { useInfiniteQuery } from "@pinia/colada";

const props = withDefaults(
  defineProps<{
    filter?: (option: { value: string; content: string }) => boolean;
    portal?: boolean;
  }>(),
  {
    filter: () => true,
    portal: true,
  },
);

const { t } = useI18n();

const languageId = defineModel<string | undefined>();
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
        content: t(language.id),
        value: language.id,
      };
    })
    .filter((option) => props.filter(option));
});
</script>

<template>
  <Picker
    v-model="languageId"
    v-model:search="search"
    :options
    :placeholder="t('选择一个语言...')"
    :load-more="() => loadNextPage()"
    :portal="props.portal"
  />
</template>
