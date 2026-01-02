<script setup lang="ts">
import { computed, ref } from "vue";
import type { PickerOption } from "./picker/index.ts";
import MultiPicker from "./picker/MultiPicker.vue";
import { useI18n } from "vue-i18n";
import { computedAsyncClient } from "@/app/utils/vue.ts";
import { orpc } from "@/server/orpc";

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

const languages = computedAsyncClient(async () => {
  return (
    await orpc.language.getAll({
      searchQuery: search.value,
    })
  ).languages;
}, []);

const options = computed(() => {
  return languages.value
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
