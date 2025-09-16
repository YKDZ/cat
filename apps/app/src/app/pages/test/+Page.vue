<script setup lang="ts">
import { onMounted } from "vue";
import { trpc } from "@/server/trpc/client.ts";
import HToggleExample from "@/app/components/headless/HToggle.example.vue";

onMounted(() => {
  trpc.test.testErr.mutate();
});
</script>

<template>
  <HToggleExample />
</template>
