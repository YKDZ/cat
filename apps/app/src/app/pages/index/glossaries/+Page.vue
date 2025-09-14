<script setup lang="ts">
import GlossaryList from "@/app/components/GlossaryList.vue";
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";

const { glossaries } = useData<Data>();
</script>

<template>
  <GlossaryList :glossaries />
</template>
