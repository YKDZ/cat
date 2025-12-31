<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import Picker from "@/app/components/picker/Picker.vue";
import { computedAsyncClient } from "@/app/utils/vue";
import { orpc } from "@/server/orpc";

const props = withDefaults(
  defineProps<{
    filter?: (option: { value: string; content: string }) => boolean;
  }>(),
  {
    filter: () => true,
  },
);

const { t } = useI18n();

const languageId = defineModel<string | undefined>();
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
  />
</template>
