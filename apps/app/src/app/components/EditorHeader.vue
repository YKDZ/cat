<script setup lang="ts">
import { storeToRefs } from "pinia";
import Header from "./headless/HHeader.vue";
import DocumentBreadcrumb from "./DocumentBreadcrumb.vue";
import HButton from "./headless/HButton.vue";
import { useSidebarStore } from "@/app/stores/sidebar.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";

const { isFolding } = storeToRefs(useSidebarStore());

const { document } = storeToRefs(useEditorContextStore());
</script>

<template>
  <Header
    :classes="{
      header: 'header',
    }"
  >
    <HButton
      :classes="{
        base: 'btn btn-md btn-transparent btn-square',
      }"
      icon="icon-[mdi--menu]"
      class="font-bold md:hidden"
      @click.stop="isFolding = !isFolding"
    />
    <DocumentBreadcrumb v-if="document" :document />
  </Header>
</template>
