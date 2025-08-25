<script setup lang="ts">
import type { Document } from "@cat/shared";
import Button from "./Button.vue";
import DocumentBreadcrumb from "./DocumentBreadcrumb.vue";
import Header from "./Header.vue";
import { ref } from "vue";

const isFolding = ref(false);

const props = defineProps<{
  document: Document;
}>();
</script>

<template>
  <Header>
    <Button
      transparent
      no-text
      icon="i-mdi:menu"
      class="font-bold md:hidden"
      @click="isFolding = !isFolding"
    />
    <DocumentBreadcrumb :document />
  </Header>
</template>
