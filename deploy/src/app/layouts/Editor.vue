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
const { languageFromId, languageToId } = storeToRefs(useEditorStore());

watch(
  () => ctx.routeParams["documentId"],
  async (to) => {
    if (import.meta.env.SSR) return;
    await fetchDocument(to).catch(trpcWarn);
  },
  { immediate: true },
);

watch(
  () => ctx.routeParams["languageFromTo"],
  (to) => {
    if (import.meta.env.SSR) return;
    const [fromId, toId] = to.split("-");
    languageFromId.value = fromId;
    languageToId.value = toId;
  },
  { immediate: true },
);

watch(
  () => parseInt(ctx.routeParams["elementId"]),
  async (to) => {
    if (import.meta.env.SSR) return;
    if (!to) return;

    await toElement(to).catch(trpcWarn);
    await fetchTranslations(to).catch(trpcWarn);
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex flex-col h-full max-h-full w-full md:flex-row">
    <EditorSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <EditorHeader />
      <!-- Content -->
      <div class="m-4 mb-0 flex flex-col gap-2 h-full max-h-full">
        <slot />
      </div>
    </div>
  </div>
</template>
