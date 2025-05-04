<script setup lang="ts">
import { storeToRefs } from "pinia";
import EditorSidebar from "../components/EditorSidebar.vue";
import { useEditorStore } from "../stores/editor";
import { watch } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { useToastStore } from "../stores/toast";
import EditorHeader from "../components/EditorHeader.vue";

const ctx = usePageContext();

const { trpcWarn } = useToastStore();
const { fetchDocument, fetchTranslations, toElement } = useEditorStore();
const { languageFromId, languageToId, translationValue, selfTranslation } =
  storeToRefs(useEditorStore());

watch(
  () => ctx.routeParams["documentId"],
  async (to) => {
    await fetchDocument(to).catch(trpcWarn);
  },
  { immediate: true },
);

watch(
  () => ctx.routeParams["languageFromTo"],
  (to) => {
    const [fromId, toId] = to.split("-");
    languageFromId.value = fromId;
    languageToId.value = toId;
  },
  { immediate: true },
);

watch(
  () => ctx.routeParams["elementId"],
  async (to) => {
    await toElement(parseInt(to)).catch(trpcWarn);
    await fetchTranslations(parseInt(to)).catch(trpcWarn);
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex flex-col h-full max-h-full w-full md:flex-row">
    <EditorSidebar />
    <div class="flex flex-col h-full w-full">
      <EditorHeader />
      <!-- Content -->
      <div class="m-4 flex flex-col gap-2 h-full max-h-full overflow-y-auto">
        <slot />
      </div>
    </div>
  </div>
</template>
