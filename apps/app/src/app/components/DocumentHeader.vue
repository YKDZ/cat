<script setup lang="ts">
import type { Document } from "@cat/shared/prisma/schema/document";
import DocumentBreadcrumb from "./DocumentBreadcrumb.vue";
import Header from "./Header.vue";
import { ref } from "vue";
import HButton from "./headless/HButton.vue";

const isFolding = ref(false);

const props = defineProps<{
  document: Document;
}>();
</script>

<template>
  <Header>
    <HButton
      :classes="{
        base: 'btn btn-transparent btn-md btn-square',
      }"
      icon="i-mdi:menu"
      class="md:hidden"
      @click="isFolding = !isFolding"
    />
    <DocumentBreadcrumb :document />
  </Header>
</template>
