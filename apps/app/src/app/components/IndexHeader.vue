<script setup lang="ts">
import Header from "./Header.vue";
import { storeToRefs } from "pinia";
import { useSidebarStore } from "../stores/sidebar";
import HButton from "./headless/HButton.vue";

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
