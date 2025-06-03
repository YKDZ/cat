<script setup lang="ts">
import { Glossary } from "@cat/shared";
import IndexSidebar from "../components/IndexSidebar.vue";
import { provide, ref, watch } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { storeToRefs } from "pinia";
import { glossaryKey } from "../utils/provide";
import { useGlossaryStore } from "../stores/glossary";
import GlossaryHeader from "@/app/components/GlossaryHeader.vue";

const ctx = usePageContext();

const glossary = ref<Glossary | null>(null);

provide(glossaryKey, glossary);

const { glossaries } = storeToRefs(useGlossaryStore());

watch(
  () => ctx.routeParams,
  () => {
    glossary.value =
      glossaries.value.find(
        (glossary) => glossary.id === ctx.routeParams.glossaryId,
      ) ?? null;
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <GlossaryHeader />
      <!-- Content -->
      <div class="p-4 pt-0 flex flex-col">
        <slot />
      </div>
    </div>
  </div>
</template>
