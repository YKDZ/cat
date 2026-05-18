<script setup lang="ts">
import { inject } from "vue";

import { useInjectionKey } from "@/utils/provide.ts";

import type { Data as LayoutData } from "../+data.server.ts";

import ContentNodeTreePanel from "./ContentNodeTreePanel.vue";
import TermDiscoveryBtn from "./TermDiscoveryBtn.vue";
import UploadFileBtn from "./UploadFileBtn.vue";

const project = inject(useInjectionKey<LayoutData>()("project"))!;
const contentNodes = inject(useInjectionKey<LayoutData>()("contentNodes"))!;
</script>

<template>
  <div class="flex w-full flex-col gap-3 pt-3">
    <UploadFileBtn :project />
    <TermDiscoveryBtn :project :content-nodes="contentNodes" />
    <ContentNodeTreePanel :project :content-nodes="contentNodes" />
  </div>
</template>
