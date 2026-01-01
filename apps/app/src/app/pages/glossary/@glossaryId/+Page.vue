<script setup lang="ts">
import InsertTermBtn from "./InsertTermBtn.vue";
import { useInjectionKey } from "@/app/utils/provide";
import { inject } from "vue";
import type { Data } from "./+data.server.ts";

const glossary = inject(useInjectionKey<Data>()("glossary"))!;
</script>

<template>
  <InsertTermBtn :glossary-id="glossary.id" />
</template>
