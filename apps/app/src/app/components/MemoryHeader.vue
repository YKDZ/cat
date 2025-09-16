<script setup lang="ts">
import { storeToRefs } from "pinia";
import { inject } from "vue";
import MemoryBreadcrumb from "./MemoryBreadcrumb.vue";
import HButton from "./headless/HButton.vue";
import Header from "@/app/components/headless/HHeader.vue";

import { useSidebarStore } from "@/app/stores/sidebar.ts";
import { memoryKey } from "@/app/utils/provide.ts";

const { isFolding } = storeToRefs(useSidebarStore());

const memory = inject(memoryKey);
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
      icon="i-mdi:menu"
      class="font-bold md:hidden"
      @click.stop="isFolding = !isFolding"
    />
    <MemoryBreadcrumb v-if="memory" :memory />
  </Header>
</template>
