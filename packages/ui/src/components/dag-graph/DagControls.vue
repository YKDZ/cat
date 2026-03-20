<script setup lang="ts">
/**
 * @shadcn-custom-component
 * description: Controls (zoom/fit) wrapper for Vue Flow DAG graph
 * lastReviewed: 2026-03-20
 */
import { Controls } from "@vue-flow/controls";
import "@vue-flow/controls/dist/style.css";
</script>

<template>
  <Controls :show-interactive="false" />
</template>
