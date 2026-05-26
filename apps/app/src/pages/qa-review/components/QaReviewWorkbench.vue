<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import Memories from "@/pages/editor/Memories.vue";
import Terms from "@/pages/editor/Terms.vue";
import { useQaReviewWorkbenchStore } from "@/stores/qa-review/workbench";
import { useProjectWriteCapabilityStore } from "@/stores/write-capability";

import ReviewActionBar from "./ReviewActionBar.vue";
import ReviewCandidateList from "./ReviewCandidateList.vue";

const { t } = useI18n();
const store = useQaReviewWorkbenchStore();
const { detail, selectedCandidate, selectedElementId, noteBody, submitError } =
  storeToRefs(store);
const writeCapability = useProjectWriteCapabilityStore();
const { canWrite, disabledReason } = storeToRefs(writeCapability);
const writeDisabled = computed(() => !canWrite.value);
</script>

<template>
  <div class="flex min-h-full flex-col gap-4 p-4">
    <div
      v-if="!selectedElementId"
      class="flex min-h-96 flex-col items-center justify-center gap-3 text-muted-foreground"
    >
      <p>{{ t("当前筛选已处理完") }}</p>
    </div>

    <template v-else-if="detail">
      <section class="border-b pb-4">
        <div class="text-xs font-medium text-muted-foreground">
          {{ t("源文") }}
        </div>
        <p class="mt-2 text-base whitespace-pre-wrap">
          {{ detail.sourceText }}
        </p>
      </section>

      <section v-if="detail.approvedTranslation" class="rounded-md border p-3">
        <div class="text-xs font-medium text-muted-foreground">
          {{ t("当前批准译文") }}
        </div>
        <p class="mt-1 text-sm whitespace-pre-wrap">
          {{ detail.approvedTranslation.text }}
        </p>
      </section>

      <ReviewCandidateList :candidates="detail.candidates" />

      <div class="grid gap-4 border-t pt-4 md:grid-cols-2">
        <Memories />
        <Terms />
      </div>

      <ReviewActionBar
        v-model:note-body="noteBody"
        :candidate="selectedCandidate"
        :error="submitError"
        :write-disabled="writeDisabled"
        :disabled-reason="disabledReason"
        @approve="store.submitAction('APPROVE')"
        @reject="store.submitAction('REJECT_CANDIDATE')"
        @defer="store.submitAction('DEFER')"
      />
    </template>
  </div>
</template>
