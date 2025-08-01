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
  storedElements,
  elementId: currentElementId,
} = storeToRefs(useEditorStore());

const { updateElementStatus } = useEditorStore();

const props = defineProps<{
  element: TranslatableElement & { status?: "NO" | "TRANSLATED" | "APPROVED" };
}>();

const element = ref<
  TranslatableElement & { status?: "NO" | "TRANSLATED" | "APPROVED" }
>(props.element);

const handleClick = () => {
  if (!element.value) return;

  navigate(
    `/editor/${documentId.value}/${languageFromId.value}-${languageToId.value}/${element.value.id}`,
  );
};

onMounted(() => {
  updateElementStatus(element.value.id)
    .then(() => {
      element.value = storedElements.value.find(
        (el) => el.id === props.element.id,
      )!;
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
