<script setup lang="ts">
import { inject } from "vue";
import DocumentDiffBox from "@/app/components/DocumentDiffBox.vue";
import { documentKey } from "@/app/utils/provide.ts";

const document = inject(documentKey);
</script>

<template>
  <DocumentDiffBox v-if="document" :document-id="document.id" />
</template>
