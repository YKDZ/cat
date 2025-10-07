<script setup lang="ts">
import GlossaryInsertTermBtn from "@/app/components/GlossaryInsertTermBtn.vue";
import { useInjectionKey } from "@/app/utils/provide";
import { inject } from "vue";
import type { Data } from "./+data.server.ts";

const glossary = inject(useInjectionKey<Data>()("glossary"))!;
</script>

<template>
  <GlossaryInsertTermBtn :glossary-id="glossary.id" />
</template>
