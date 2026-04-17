<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";

import { useBranchStore } from "@/app/stores/branch";

import type { Data } from "./+data.ts";

const { t } = useI18n();
const data = useData<Data>();
const { pr, projectId } = data;

const branchStore = useBranchStore();

watch(
  () => data.pr,
  (currentPr) => {
    if (currentPr && currentPr.status === "OPEN" && currentPr.branchId) {
      branchStore.enterBranch(
        currentPr.branchId,
        currentPr.id,
        currentPr.number,
      );
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  branchStore.leaveBranch();
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2">
      <a
        :href="`/project/${projectId}/pull-requests`"
        class="text-sm text-muted-foreground hover:underline"
      >
        ← {{ t("Pull Requests") }}
      </a>
    </div>

    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <h1 class="text-xl font-semibold">{{ pr.title }}</h1>
        <span
          class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 capitalize"
        >
          {{ pr.status.toLowerCase() }}
        </span>
      </div>
      <p class="text-sm text-muted-foreground">#{{ pr.number }}</p>
    </div>

    <div
      v-if="pr.body"
      class="rounded-md border p-4 text-sm whitespace-pre-wrap"
    >
      {{ pr.body }}
    </div>
    <div v-else class="text-sm text-muted-foreground italic">
      {{ t("暂无描述。") }}
    </div>
  </div>
</template>
