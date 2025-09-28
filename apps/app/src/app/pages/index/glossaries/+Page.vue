<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.server.ts";
import GlossaryList from "@/app/components/GlossaryList.vue";

const { glossaries } = useData<Data>();
</script>

<template>
  <GlossaryList :glossaries />
</template>
