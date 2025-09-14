<script setup lang="ts">
import { onMounted } from "vue";
import { trpc } from "@/server/trpc/client.ts";

onMounted(() => {
  trpc.test.testErr.mutate();
});
</script>

<template></template>
