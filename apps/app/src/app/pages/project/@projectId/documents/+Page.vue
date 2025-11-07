<script setup lang="ts">
import { inject } from "vue";
import type { Data as LayoutData } from "../+data.server.ts";
import ProjectDocumentTree from "@/app/components/ProjectDocumentTree.vue";
import ProjectUploadFileBtn from "@/app/components/ProjectUploadFileBtn.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";

const project = inject(useInjectionKey<LayoutData>()("project"))!;
const documents = inject(useInjectionKey<LayoutData>()("documents"))!;
</script>

<template>
  <div class="pt-3 flex flex-col gap-3 w-full">
    <ProjectUploadFileBtn :project />
    <ProjectDocumentTree :project :documents />
  </div>
</template>
