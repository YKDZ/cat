<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import MultiPicker from "./picker/MultiPicker.vue";
import { Memory } from "@cat/shared";
import { trpc } from "@/server/trpc/client";
import { PickerOption } from "./picker";

const props = withDefaults(
  defineProps<{
    width?: string;
  }>(),
  {
    width: "fit-content",
  },
);

const memoryIds = defineModel<string[]>("memoryIds", { required: true });

const memories = ref<Memory[]>([]);
const options = computed(() => {
  const result: PickerOption[] = [];
  result.push({
    value: "createNew",
    content: "创建一个同名记忆库",
  });
  memories.value.forEach((mem) => {
    result.push({
      value: mem.id,
      content: mem.name,
    });
  });
  return result;
});

onMounted(() => {
  trpc.memory.listOwned.query().then((mems) => {
    memories.value = mems;
  });
});
</script>

<template>
  <MultiPicker
    v-model="memoryIds"
    :options
    :width
    placeholder="选择一个或多个记忆库"
  />
</template>
