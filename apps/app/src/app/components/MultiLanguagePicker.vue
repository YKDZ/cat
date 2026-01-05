<script setup lang="ts">
import { computed, ref } from "vue";
import type { PickerOption } from "./picker/index.ts";
import MultiPicker from "./picker/MultiPicker.vue";
import { useI18n } from "vue-i18n";
import { orpc } from "@/server/orpc";
import { useQuery } from "@pinia/colada";

const props = withDefaults(
  defineProps<{
    filter?: (option: PickerOption) => boolean;
  }>(),
  {
    filter: () => true,
  },
);

const { t } = useI18n();

const languageIds = defineModel<string[]>({ default: [] });
const search = ref("");

const { state } = useQuery({
  key: ["languages", search.value],
  query: () =>
    orpc.language.getAll({
      searchQuery: search.value,
    }),
});

const options = computed(() => {
  if (!state.value || !state.value.data) return [];

  return state.value.data.languages
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
  />
</template>
