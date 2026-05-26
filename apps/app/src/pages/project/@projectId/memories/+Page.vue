<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { computed, inject } from "vue";

import { useInjectionKey } from "@/utils/provide.ts";

import type { Data as LayoutData } from "../+data.server.ts";
import type { Data } from "./+data.server.ts";

import ProjectPageDataError from "../ProjectPageDataError.vue";
import MemoryLinkerBtn from "./MemoryLinkerBtn.vue";
import MemoryList from "./MemoryList.vue";

const data = useData<Data>();
const pageError = computed(() => data.pageError);
const memories = computed(() => data.memories ?? []);

const project = inject(useInjectionKey<LayoutData>()("project"))!;
</script>

<template>
  <ProjectPageDataError v-if="pageError" :message="pageError.message" />
  <template v-else>
    <div class="my-3 space-y-3">
      <div class="flex items-center justify-between">
        <MemoryLinkerBtn class="self-end" :project />
      </div>
    </div>
    <MemoryList :memories :project />
  </template>
</template>
