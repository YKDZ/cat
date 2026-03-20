<script setup lang="ts">
/**
 * @shadcn-custom-component
 * description: Minimap wrapper for Vue Flow DAG graph
 * lastReviewed: 2026-03-20
 */
import { MiniMap } from "@vue-flow/minimap";
import "@vue-flow/minimap/dist/style.css";
</script>

<template>
  <MiniMap :pannable="true" :zoomable="true" />
</template>
