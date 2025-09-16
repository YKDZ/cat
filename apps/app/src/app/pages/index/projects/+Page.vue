<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import ProjectList from "@/app/components/ProjectList.vue";

const { projects } = useData<Data>();
</script>

<template>
  <ProjectList :projects />
</template>
