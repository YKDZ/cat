<script setup lang="ts">
import { navigate } from "vike/client/router";
import { useEditorStore } from "../stores/editor";
import { storeToRefs } from "pinia";
import { computed, onMounted } from "vue";
import { useToastStore } from "../stores/toast";

const { trpcWarn } = useToastStore();

const {
  documentId,
  languageFromId,
  languageToId,
  storedElements,
  elementId: currentElementId,
} = storeToRefs(useEditorStore());

const { queryElementTranslationStatus } = useEditorStore();

const props = defineProps<{
  elementId: number;
}>();

const element = computed(() => {
  return storedElements.value.find((e) => e.id === props.elementId);
});

const handleClick = () => {
  if (!element.value) return;

  navigate(
    `/editor/${documentId.value}/${languageFromId.value}-${languageToId.value}/${element.value.id}`,
  );
};

onMounted(() => {
  queryElementTranslationStatus(props.elementId)
    .then((queried) => {
      if (!element.value) return;
      element.value.status = queried;
    })
    .catch(trpcWarn);
});
</script>

<template>
  <button
    v-if="element"
    class="px-2 py-2 text-start flex gap-3 cursor-pointer items-center hover:bg-highlight-darkest"
    :class="{
      'bg-highlight-darkest': elementId === currentElementId,
    }"
    @click="handleClick"
  >
    <span
      class="h-2 min-h-2 min-w-2 w-2 block"
      :class="{
        'bg-red-500': element.status === 'NO',
        'bg-blue-500': element.status === 'TRANSLATED',
        'bg-green-500': element.status === 'APPROVED',
      }"
    />
    <span class="text-nowrap overflow-x-hidden">{{ element.value }}</span>
  </button>
</template>
