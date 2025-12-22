<script setup lang="ts">
import PluginComponentSlotInternal from "@/app/components/plugin/PluginComponentSlotInternal.vue";

const props = defineProps<{
  id: string;
}>();
</script>

<template>
  <PluginComponentSlotInternal :id="id" />
</template>
