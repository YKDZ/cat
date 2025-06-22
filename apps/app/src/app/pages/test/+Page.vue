<script setup lang="ts">
import PluginComponentSlot from "@/app/components/plugin-component/PluginComponentSlot.vue";
import { trpc } from "@/server/trpc/client";
import { onMounted } from "vue";

onMounted(() => {
  trpc.task.triggerCleanDanglingFiles.mutate();
});
</script>

<template>
  <PluginComponentSlot id="index" />
</template>
