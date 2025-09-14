<script setup lang="ts">
import { storeToRefs } from "pinia";
import Header from "./Header.vue";
import HButton from "./headless/HButton.vue";
import { useSidebarStore } from "@/app/stores/sidebar.ts";

const { isFolding } = storeToRefs(useSidebarStore());
</script>

<template>
  <Header>
    <HButton
      :classes="{
        base: 'btn btn-transparent',
      }"
      @click="isFolding = !isFolding"
    />
  </Header>
</template>
