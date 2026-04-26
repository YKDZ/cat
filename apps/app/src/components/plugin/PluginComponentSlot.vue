<script setup lang="ts">
import PluginComponentSlotInternal from "@/components/plugin/PluginComponentSlotInternal.vue";

const props = defineProps<{
  id: string;
}>();
</script>

<template>
  <PluginComponentSlotInternal :id="id" />
</template>
