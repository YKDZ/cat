<script setup lang="ts">
import IndexSidebar from "../components/IndexSidebar.vue";
import type { Ref } from "vue";
import { provide, ref, watch } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { documentKey } from "../utils/provide";
import { useDocumentStore } from "../stores/document";
import type { Document } from "@cat/shared";
import DocumentHeader from "../components/DocumentHeader.vue";
import { storeToRefs } from "pinia";

const ctx = usePageContext();

const document = ref<Document | null>(null);

provide(documentKey, document as Ref<Document>);

const { documents } = useDocumentStore();

const updateDocument = () => {
  document.value =
    documents.find((document) => document.id === ctx.routeParams.documentId) ??
    null;
};

watch(() => ctx.routeParams, updateDocument, { immediate: true });
watch(storeToRefs(useDocumentStore()).documents, updateDocument, {
  immediate: true,
});
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <DocumentHeader :document />
      <!-- Content -->
      <div class="p-4 pt-0 flex flex-col">
        <slot />
      </div>
    </div>
  </div>
</template>
