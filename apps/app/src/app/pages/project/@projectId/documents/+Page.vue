<script setup lang="ts">
import { inject } from "vue";
import { useData } from "vike-vue/useData";
import type { Data as LayoutData } from "../+data.ts";
import type { Data } from "./+data.ts";
import ProjectDocumentList from "@/app/components/ProjectDocumentList.vue";
import ProjectUploadFileBtn from "@/app/components/ProjectUploadFileBtn.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";

const project = inject(useInjectionKey<LayoutData, "project">())!;

const { documents } = useData<Data>();
</script>

<template>
  <div class="pt-3 flex flex-col gap-3 w-full">
    <ProjectUploadFileBtn :project />
    <ProjectDocumentList :documents />
  </div>
</template>
