<script setup lang="ts">
import ProjectList from "@/app/components/ProjectList.vue";
import type { Data } from "./+data.ts";
import { useData } from "vike-vue/useData";

const { projects } = useData<Data>();
</script>

<template>
  <ProjectList v-model="projects" />
</template>
