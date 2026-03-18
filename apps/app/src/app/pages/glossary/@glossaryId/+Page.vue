<script setup lang="ts">
import { Button } from "@cat/ui";
import { ref } from "vue";
import { inject } from "vue";
import { useI18n } from "vue-i18n";

import { useInjectionKey } from "@/app/utils/provide";

import type { Data } from "./+data.server.ts";

import ConceptTable from "./ConceptTable.vue";
import InsertConceptBtn from "./InsertConceptBtn.vue";
import InsertConceptSubjectBtn from "./InsertConceptSubjectBtn.vue";
import InsertTermBtn from "./InsertTermBtn.vue";
import PairTable from "./PairTable.vue";

const { t } = useI18n();
const glossary = inject(useInjectionKey<Data>()("glossary"))!;
const currentView = ref<"pairs" | "concepts">("pairs"); // 默认显示pair模式
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <div class="flex gap-2">
        <Button
          variant="outline"
          :class="{ active: currentView === 'pairs' }"
          @click="currentView = 'pairs'"
        >
          {{ t("术语对") }}
        </Button>
        <Button
          variant="outline"
          :class="{ active: currentView === 'concepts' }"
          @click="currentView = 'concepts'"
        >
          {{ t("概念") }}
        </Button>
      </div>
      <div class="flex gap-2">
        <InsertConceptSubjectBtn :glossary-id="glossary.id" />
        <InsertTermBtn :glossary-id="glossary.id" />
        <InsertConceptBtn :glossary-id="glossary.id" />
      </div>
    </div>

    <div v-if="currentView === 'pairs'" class="w-full">
      <PairTable />
    </div>
    <div v-else-if="currentView === 'concepts'" class="w-full">
      <ConceptTable />
    </div>
  </div>
</template>

<style scoped>
.active {
  background-color: #e2e8f0;
  border-color: #94a3b8;
}
</style>
