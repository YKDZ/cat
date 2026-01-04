<script setup lang="ts">
import { computed, inject } from "vue";
import type { Data } from "../+data.server.ts";
import DetailCard from "./DetailCard.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";
import Readme from "./Readme.vue";
import LanguageTable from "./LanguageTable.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { orpc } from "@/server/orpc.ts";
import { Button } from "@/app/components/ui/button/index.ts";

const project = inject(useInjectionKey<Data>()("project"))!;
const targetLanguages = inject(useInjectionKey<Data>()("targetLanguages"))!;
const documents = inject(useInjectionKey<Data>()("documents"))!;

const readme = computed(() => {
  return documents.find((doc) => doc.name === "README.md") ?? null;
});

const { info } = useToastStore();

const snapshot = async () => {
  const count = await orpc.project.snapshot({
    projectId: project.id,
  });

  info(`为 ${count} 个元素的翻译拍摄了快照`);
};
</script>

<template>
  <div
    class="mt-3 items-start w-full grid md:grid-cols-[2fr_1fr] grid-cols-1 gap-2 mx-auto"
  >
    <div class="flex flex-col gap-6 w-full items-start">
      <LanguageTable :project :languages="targetLanguages" />
      <Readme v-if="readme" :readme />
    </div>
    <DetailCard :project />
    <Button @click="snapshot">拍摄快照</Button>
  </div>
</template>
