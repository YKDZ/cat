<script setup lang="ts">
import DocumentDiffBox from "@/app/components/DocumentDiffBox.vue";
import { inject } from "vue";
import { documentKey } from "@/app/utils/provide";

const document = inject(documentKey);
</script>

<template>
  <DocumentDiffBox v-if="document" :document-id="document.id" />
</template>
