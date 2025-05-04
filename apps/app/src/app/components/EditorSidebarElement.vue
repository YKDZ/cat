<script setup lang="ts">
import { navigate } from "vike/client/router";
import { useEditorStore } from "../stores/editor";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";

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

onMounted(() => {
  queryElementTranslationStatus(props.elementId)
    .then((queried) => {
      if (!element.value) return;
      element.value.status = queried;
    })
    .catch((e) => {
      console.log(e);
    });
});
</script>

<template>
  <button
    v-if="element"
    class="px-2 py-2 text-start flex gap-3 cursor-pointer items-center hover:bg-gray-300"
    :class="{
      'bg-gray-200': elementId === currentElementId,
    }"
    @click="
      navigate(
        `/editor/${documentId}/${languageFromId}-${languageToId}/${element.id}`,
      )
    "
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
