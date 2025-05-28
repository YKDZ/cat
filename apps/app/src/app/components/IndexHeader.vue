<script setup lang="ts">
import Header from "./Header.vue";
import Button from "./Button.vue";
import { storeToRefs } from "pinia";
import { useSidebarStore } from "../stores/sidebar";

const { isFolding } = storeToRefs(useSidebarStore());
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
  </Header>
</template>
