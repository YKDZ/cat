<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import { onMounted } from "vue";

onMounted(() => {
  trpc.test.testErr.mutate();
});
</script>

<template></template>
