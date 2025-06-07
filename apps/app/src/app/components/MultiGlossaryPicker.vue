<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import MultiPicker from "./picker/MultiPicker.vue";
import type { Glossary } from "@cat/shared";
import { trpc } from "@/server/trpc/client";
import type { PickerOption } from "./picker";
import { usePageContext } from "vike-vue/usePageContext";

const { user } = usePageContext();

const props = withDefaults(
  defineProps<{
    width?: string;
    createNew?: boolean;
  }>(),
  {
    width: "fit-content",
    createNew: false,
  },
);

const memoryIds = defineModel<string[]>("glossaryIds", { required: true });

const glossaries = ref<Glossary[]>([]);
const options = computed(() => {
  const result: PickerOption[] = [];

  if (props.createNew) {
    result.push({
      value: "createNew",
      content: "创建一个同名术语库",
    });
  }

  glossaries.value.forEach((glo) => {
    result.push({
      value: glo.id,
      content: glo.name,
    });
  });
  return result;
});

onMounted(() => {
  if (!user) return;

  trpc.glossary.listUserOwned
    .query({
      userId: user.id,
    })
    .then((glos) => {
      glossaries.value = glos;
    });
});
</script>

<template>
  <MultiPicker
    v-model="memoryIds"
    :options
    :width
    placeholder="选择一个或多个术语库"
  />
</template>
