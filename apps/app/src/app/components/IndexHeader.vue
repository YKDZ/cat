<script setup lang="ts">
import { storeToRefs } from "pinia";
import Header from "./headless/HHeader.vue";
import HButton from "./headless/HButton.vue";
import { useSidebarStore } from "@/app/stores/sidebar.ts";

const { isFolding } = storeToRefs(useSidebarStore());
</script>

<template>
  <Header
    :classes="{
      header: 'header',
    }"
  >
    <HButton
      :classes="{
        base: 'btn btn-transparent',
      }"
      @click="isFolding = !isFolding"
    />
  </Header>
</template>
