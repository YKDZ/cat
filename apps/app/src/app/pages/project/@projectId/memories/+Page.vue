<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import ProjectMemoryList from "@/app/components/ProjectMemoryList.vue";
import ProjectMemoryLinkerBtn from "@/app/components/ProjectMemoryLinkerBtn.vue";

const { memories } = useData<Data>();
</script>

<template>
  <div class="my-3 flex items-center justify-between">
    <div>
      <ProjectMemoryLinkerBtn class="self-end" />
    </div>
  </div>
  <ProjectMemoryList :memories />
</template>
