<script setup lang="ts">
import PluginComponentSlot from "@/app/components/plugin-component/PluginComponentSlot.vue";
</script>

<template>
  <Suspense>
    <PluginComponentSlot id="index" />
  </Suspense>
</template>
