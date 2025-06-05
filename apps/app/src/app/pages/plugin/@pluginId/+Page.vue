<script setup lang="ts">
import PluginConfigs from "@/app/components/PluginConfigs.vue";
import PluginDeleteBtn from "@/app/components/PluginDeleteBtn.vue";
import { pluginKey } from "@/app/utils/provide";
import { inject } from "vue";

const plugin = inject(pluginKey);
</script>

<template>
  <PluginConfigs v-if="plugin" :configs="plugin.Configs!" />
  <PluginDeleteBtn v-if="plugin" :id="plugin.id" />
</template>
