<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.server.ts";
import List from "./List.vue";

const { memories } = useData<Data>();
</script>

<template>
  <List :memories />
</template>
