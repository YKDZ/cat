<script setup lang="ts">
import { computed } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { orpc } from "@/server/orpc";
import type { PickerOption } from "./picker/index.ts";
import MultiPicker from "./picker/MultiPicker.vue";
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import { useQuery } from "@pinia/colada";

const props = withDefaults(
  defineProps<{
    filter?: (option: PickerOption) => boolean;
    getter?: () => Promise<Pick<Memory, "id" | "name">[]>;
  }>(),
  {
    filter: () => true,
    getter: async () => {
      const { user } = usePageContext();
      if (!user) return [];
      return await orpc.memory.getUserOwned({
        userId: user.id,
      });
    },
  },
);

const memoryIds = defineModel<string[]>();

const { state } = useQuery({
  key: ["memories"],
  query: () => props.getter(),
});

const options = computed(() => {
  if (!state.value || !state.value.data) return [];

  return state.value.data
    .filter((memory) =>
      props.filter({
        value: memory.id,
        content: memory.name,
      }),
    )
    .map((mem) => ({
      value: mem.id,
      content: mem.name,
    }));
});
</script>

<template>
  <MultiPicker
    v-model="memoryIds"
    :options
    :placeholder="$t('选择一个或多个记忆库')"
  />
</template>
