<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { inject } from "vue";
import type { Data as LayoutData } from "../+data.ts";
import type { Data } from "./+data.ts";
import ProjectGlossaryLinkerBtn from "@/app/components/ProjectGlossaryLinkerBtn.vue";
import ProjectGlossaryList from "@/app/components/ProjectGlossaryList.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";

const { glossaries } = useData<Data>();

const project = inject(useInjectionKey<LayoutData>("project"))!;
</script>

<template>
  <div class="my-3 flex items-center justify-between">
    <div></div>
    <div>
      <ProjectGlossaryLinkerBtn class="self-end" :project />
    </div>
  </div>
  <ProjectGlossaryList :glossaries />
</template>
