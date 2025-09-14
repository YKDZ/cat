<script setup lang="ts">
import { inject } from "vue";
import { pluginKey } from "@/app/utils/provide.ts";

const plugin = inject(pluginKey);
</script>

<template>
  <span>插件 {{ plugin?.name }} 的用户层页面</span>
</template>
