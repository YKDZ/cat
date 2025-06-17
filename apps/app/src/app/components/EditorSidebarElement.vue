<script setup lang="ts">
import { navigate } from "vike/client/router";
import { useEditorStore } from "../stores/editor";
import { storeToRefs } from "pinia";
import { onMounted, ref } from "vue";
import { useToastStore } from "../stores/toast";
import type { TranslatableElement } from "@cat/shared";

const { trpcWarn } = useToastStore();

const {
  documentId,
  languageFromId,
  languageToId,
  elementId: currentElementId,
} = storeToRefs(useEditorStore());

const { queryElementTranslationStatus, upsertElements } = useEditorStore();

const props = defineProps<{
  element: TranslatableElement;
}>();

const element = ref<TranslatableElement>(props.element);

const handleClick = () => {
  if (!element.value) return;

  navigate(
    `/editor/${documentId.value}/${languageFromId.value}-${languageToId.value}/${element.value.id}`,
  );
};

onMounted(() => {
  queryElementTranslationStatus(element.value.id)
    .then((queried) => {
      if (!element.value) return;
      element.value.status = queried;
      upsertElements(element.value);
    })
    .catch(trpcWarn);
});
</script>

<template>
  <button
    v-if="element"
    class="px-2 py-2 text-start flex gap-3 cursor-pointer items-center hover:bg-highlight-darkest"
    :class="{
      'bg-highlight-darkest': element.id === currentElementId,
    }"
    @click="handleClick"
  >
    <span
      class="h-2 min-h-2 min-w-2 w-2 block"
      :class="{
        'bg-error-darkest': element.status === 'NO',
        'bg-info-darkest': element.status === 'TRANSLATED',
        'bg-success-darkest': element.status === 'APPROVED',
      }"
    />
    <span class="text-nowrap overflow-x-hidden">{{ element.value }}</span>
  </button>
</template>
