<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import { usePageContext } from "vike-vue/usePageContext";
import { trpc } from "@cat/app-api/trpc/client";
import type { PickerOption } from "./picker/index.ts";
import MultiPicker from "./picker/MultiPicker.vue";

withDefaults(
  defineProps<{
    width?: string;
  }>(),
  {
    width: "fit-content",
  },
);

const { user } = usePageContext();
const memoryIds = defineModel<string[]>();

const memories = ref<Memory[]>([]);
const options = computed(() => {
  const result: PickerOption[] = [];
  memories.value.forEach((mem) => {
    result.push({
      value: mem.id,
      content: mem.name,
    });
  });
  return result;
});

onMounted(async () => {
  if (!user) return;
  memories.value = await trpc.memory.getUserOwned.query({
    userId: user.id,
  });
});
</script>

<template>
  <MultiPicker
    v-model="memoryIds"
    :options
    :width
    :placeholder="$t('选择一个或多个记忆库')"
  />
</template>
