<script setup lang="ts">
import { pluginKey } from "@/app/utils/provide.ts";
import { inject } from "vue";

const plugin = inject(pluginKey);
</script>

<template>
  <span>插件 {{ plugin?.name }} 的用户层页面</span>
</template>
