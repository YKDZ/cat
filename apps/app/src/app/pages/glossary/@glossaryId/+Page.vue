<script setup lang="ts">
import InsertTermBtn from "./InsertTermBtn.vue";
import { useInjectionKey } from "@/app/utils/provide";
import { inject } from "vue";
import type { Data } from "./+data.server.ts";
import PairTable from "./PairTable.vue";
import ConceptTable from "./ConceptTable.vue";

const glossary = inject(useInjectionKey<Data>()("glossary"))!;
</script>

<template>
  <InsertTermBtn :glossary-id="glossary.id" />
  <PairTable />
  <ConceptTable />
</template>
