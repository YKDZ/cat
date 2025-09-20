<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { inject } from "vue";
import type { Data as LayoutData } from "../+data.ts";
import type { Data } from "./+data.ts";
import ProjectMemoryList from "@/app/components/ProjectMemoryList.vue";
import ProjectMemoryLinkerBtn from "@/app/components/ProjectMemoryLinkerBtn.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";

const { memories } = useData<Data>();

const project = inject(useInjectionKey<LayoutData>("project"))!;
</script>

<template>
  <div class="my-3 flex items-center justify-between">
    <div>
      <ProjectMemoryLinkerBtn class="self-end" :project />
    </div>
  </div>
  <ProjectMemoryList :memories />
</template>
