<script setup lang="ts">
import { storeToRefs } from "pinia";
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import type { User } from "@cat/shared/schema/drizzle/user";
import MemoryBreadcrumb from "./MemoryBreadcrumb.vue";
import HButton from "./headless/HButton.vue";
import Header from "@/app/components/headless/HHeader.vue";
import { useSidebarStore } from "@/app/stores/sidebar.ts";

const { isFolding } = storeToRefs(useSidebarStore());

defineProps<{
  memory: Memory & {
    Creator: User;
  };
}>();
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
    <MemoryBreadcrumb :memory />
  </Header>
</template>
