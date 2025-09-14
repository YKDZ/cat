<script setup lang="ts">
import Header from "./Header.vue";
import { storeToRefs } from "pinia";
import { useSidebarStore } from "@/app/stores/sidebar";
import { useEditorStore } from "@/app/stores/editor";
import DocumentBreadcrumb from "./DocumentBreadcrumb.vue";
import HButton from "./headless/HButton.vue";

const { isFolding } = storeToRefs(useSidebarStore());

const { document } = storeToRefs(useEditorStore());
</script>

<template>
  <Header>
    <HButton
      :classes="{
        base: 'btn btn-md btn-transparent btn-square',
      }"
      icon="i-mdi:menu"
      class="font-bold md:hidden"
      @click.stop="isFolding = !isFolding"
    />
    <DocumentBreadcrumb v-if="document" :document />
  </Header>
</template>
