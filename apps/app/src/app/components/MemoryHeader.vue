<script setup lang="ts">
import Header from "@/app/components/Header.vue";

import { storeToRefs } from "pinia";
import { useSidebarStore } from "@/app/stores/sidebar";
import MemoryBreadcrumb from "./MemoryBreadcrumb.vue";
import { memoryKey } from "@/app/utils/provide";
import { inject } from "vue";
import HButton from "./headless/HButton.vue";

const { isFolding } = storeToRefs(useSidebarStore());

const memory = inject(memoryKey);
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
    <MemoryBreadcrumb v-if="memory" :memory />
  </Header>
</template>
