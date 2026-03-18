<script setup lang="ts">
import { inject } from "vue";

import { useInjectionKey } from "@/app/utils/provide.ts";

import type { Data as LayoutData } from "../+data.server.ts";

import DocumentTree from "./DocumentTree.vue";
import UploadFileBtn from "./UploadFileBtn.vue";

const project = inject(useInjectionKey<LayoutData>()("project"))!;
const documents = inject(useInjectionKey<LayoutData>()("documents"))!;
</script>

<template>
  <div class="flex w-full flex-col gap-3 pt-3">
    <UploadFileBtn :project />
    <DocumentTree :project :documents />
  </div>
</template>
