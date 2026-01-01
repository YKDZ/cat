<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { inject } from "vue";
import type { Data as LayoutData } from "../+data.server.ts";
import type { Data } from "./+data.server.ts";
import GlossaryLinkerBtn from "./GlossaryLinkerBtn.vue";
import GlossaryList from "./GlossaryList.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";

const { glossaries } = useData<Data>();

const project = inject(useInjectionKey<LayoutData>()("project"))!;
</script>

<template>
  <div class="my-3 flex items-center justify-between">
    <GlossaryLinkerBtn class="self-end" :project />
  </div>
  <GlossaryList :glossaries :project />
</template>
