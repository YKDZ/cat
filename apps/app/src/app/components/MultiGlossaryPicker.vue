<script setup lang="ts">
import type { Glossary } from "@cat/shared";

import { useQuery } from "@pinia/colada";
import { usePageContext } from "vike-vue/usePageContext";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/app/rpc/orpc";

import type { PickerOption } from "./picker";

import MultiPicker from "./picker/MultiPicker.vue";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    filter?: (option: PickerOption) => boolean;
    getter?: () => Promise<Pick<Glossary, "id" | "name">[]>;
  }>(),
  {
    filter: () => true,
    getter: async () => {
      const { user } = usePageContext();
      if (!user) return [];
      return await orpc.glossary.getUserOwned({
        userId: user.id,
      });
    },
  },
);

const memoryIds = defineModel<string[]>();

const { state } = useQuery({
  key: ["glossaries"],
  query: () => props.getter(),
});

const options = computed(() => {
  if (!state.value || !state.value.data) return [];

  return state.value.data
    .filter((glossary) =>
      props.filter({
        value: glossary.id,
        content: glossary.name,
      }),
    )
    .map((glo) => ({
      value: glo.id,
      content: glo.name,
    }));
});
</script>

<template>
  <MultiPicker
    v-model="memoryIds"
    :options
    :placeholder="t('选择一个或多个术语库')"
  />
</template>
