<script setup lang="ts">
import { computed } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { useI18n } from "vue-i18n";
import { orpc } from "@/server/orpc";
import type { PickerOption } from "./picker";
import MultiPicker from "./picker/MultiPicker.vue";
import { computedAsyncClient } from "@/app/utils/vue";
import type { Glossary } from "@cat/shared/schema/drizzle/glossary";

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
const glossaries = computedAsyncClient(async () => {
  return await props.getter();
}, []);

const options = computed(() => {
  return glossaries.value
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
