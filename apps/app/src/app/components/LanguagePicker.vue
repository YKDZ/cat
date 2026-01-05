<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import Picker from "@/app/components/picker/Picker.vue";
import { orpc } from "@/server/orpc";
import { useQuery } from "@pinia/colada";

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

const { state } = useQuery({
  key: ["languages"],
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
