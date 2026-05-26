<script setup lang="ts">
import { Badge, Button } from "@cat/ui";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";

import { useQaReviewWorkbenchStore } from "@/stores/qa-review/workbench";

import FindingSummary from "./FindingSummary.vue";

type ReviewCandidate = {
  queueItem: {
    id: number;
    riskBucket: string;
    hardFindingCount: number;
    status: string;
  };
  translation: { id: number; text: string } | null;
  findings: Array<{
    id: number;
    action: string;
    message: string;
    ruleFamily: string | null;
    ruleId: string | null;
    severity: string;
    riskScore: number;
  }>;
  annotations: Array<{ id: number; body: string }>;
};

defineProps<{ candidates: ReviewCandidate[] }>();

const { t } = useI18n();
const store = useQaReviewWorkbenchStore();
const { selectedQueueItemId } = storeToRefs(store);
</script>

<template>
  <section class="flex flex-col gap-3">
    <article
      v-for="candidate in candidates"
      :key="candidate.queueItem.id"
      class="rounded-md border p-3"
      :class="{
        'border-primary bg-muted/40':
          selectedQueueItemId === candidate.queueItem.id,
      }"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{{ candidate.queueItem.riskBucket }}</Badge>
          <Badge
            v-if="candidate.queueItem.hardFindingCount > 0"
            variant="destructive"
          >
            {{
              t("阻断 {count}", { count: candidate.queueItem.hardFindingCount })
            }}
          </Badge>
          <Badge
            v-if="candidate.queueItem.status === 'APPROVABLE'"
            variant="secondary"
          >
            {{ t("可批准") }}
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          @click="
            candidate.translation &&
            store.selectCandidate({
              queueItemId: candidate.queueItem.id,
              translationId: candidate.translation.id,
            })
          "
        >
          {{ t("选择候选") }}
        </Button>
      </div>
      <p class="mt-3 text-sm whitespace-pre-wrap">
        {{ candidate.translation?.text ?? t("暂无候选译文") }}
      </p>
      <FindingSummary :candidate="candidate" />
      <div
        v-if="candidate.annotations.length > 0"
        class="mt-3 border-t pt-3 text-sm"
      >
        <div
          v-for="annotation in candidate.annotations"
          :key="annotation.id"
          class="py-1"
        >
          {{ annotation.body }}
        </div>
      </div>
    </article>
  </section>
</template>
