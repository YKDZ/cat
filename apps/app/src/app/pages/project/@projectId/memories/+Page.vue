<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { inject } from "vue";

import { useInjectionKey } from "@/app/utils/provide.ts";

import type { Data as LayoutData } from "../+data.server.ts";
import type { Data } from "./+data.server.ts";

import MemoryLinkerBtn from "./MemoryLinkerBtn.vue";
import MemoryList from "./MemoryList.vue";

const { memories } = useData<Data>();


const project = inject(useInjectionKey<LayoutData>()("project"))!;
</script>

<template>
  <div class="my-3 flex items-center justify-between">
    <MemoryLinkerBtn class="self-end" :project />
  </div>
  <MemoryList :memories :project />
</template>
