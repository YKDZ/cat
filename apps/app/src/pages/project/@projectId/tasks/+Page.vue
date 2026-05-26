<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { computed } from "vue";

import type { Data } from "./+data.ts";

import ProjectPageDataError from "../ProjectPageDataError.vue";

const data = useData<Data>();
const pageError = computed(() => data.pageError);
const tasks = computed(() => data.tasks ?? []);
</script>

<template>
  <ProjectPageDataError v-if="pageError" :message="pageError.message" />
  <template v-else>{{ tasks }}</template>
</template>
