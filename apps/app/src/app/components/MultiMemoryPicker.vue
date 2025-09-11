<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import MultiPicker from "./picker/MultiPicker.vue";
import type { Memory } from "@cat/shared/schema/prisma/memory";
import { trpc } from "@/server/trpc/client";
import type { PickerOption } from "./picker";
import { usePageContext } from "vike-vue/usePageContext";
import { useI18n } from "vue-i18n";

const props = withDefaults(
  defineProps<{
    width?: string;
  }>(),
  {
    width: "fit-content",
  },
);

const { t } = useI18n();

const { user } = usePageContext();
const memoryIds = defineModel<string[]>("memoryIds", { required: true });

const memories = ref<Memory[]>([]);
const options = computed(() => {
  const result: PickerOption[] = [];
  result.push({
    value: "createNew",
    content: t("创建一个同名记忆库"),
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
  trpc.memory.listUserOwned
    .query({
      userId: user!.id,
    })
    .then((mems) => {
      memories.value = mems;
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
