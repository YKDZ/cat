<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { computed, inject } from "vue";

import { useInjectionKey } from "@/utils/provide.ts";

import type { Data as LayoutData } from "../+data.server.ts";
import type { Data } from "./+data.server.ts";

import ProjectPageDataError from "../ProjectPageDataError.vue";
import GlossaryLinkerBtn from "./GlossaryLinkerBtn.vue";
import GlossaryList from "./GlossaryList.vue";

const data = useData<Data>();
const pageError = computed(() => data.pageError);
const glossaries = computed(() => data.glossaries ?? []);

const project = inject(useInjectionKey<LayoutData>()("project"))!;
</script>

<template>
  <ProjectPageDataError v-if="pageError" :message="pageError.message" />
  <template v-else>
    <div class="my-3 flex items-center justify-between">
      <GlossaryLinkerBtn class="self-end" :project />
    </div>
    <GlossaryList :glossaries :project />
  </template>
</template>
