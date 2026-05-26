<script setup lang="ts">
import {
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@cat/ui";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

type Finding = {
  id: number;
  action: string;
  ruleFamily: string | null;
  ruleId: string | null;
  severity: string;
  riskScore: number;
  message: string;
};

const { t } = useI18n();
const props = defineProps<{ candidate: { findings: Finding[] } }>();
const open = ref(false);

const blocking = computed(() =>
  props.candidate.findings.filter(
    (finding) => finding.action === "BLOCK_APPROVAL",
  ),
);
const needsReview = computed(() =>
  props.candidate.findings.filter(
    (finding) => finding.action === "NEEDS_REVIEW",
  ),
);
const informational = computed(() =>
  props.candidate.findings.filter(
    (finding) =>
      finding.action === "INFORMATIONAL" || finding.action === "PASS",
  ),
);
</script>

<template>
  <div class="mt-3 flex flex-col gap-2">
    <Badge v-if="candidate.findings.length === 0" variant="secondary">
      {{ t("未发现问题") }}
    </Badge>
    <div v-else class="flex flex-wrap gap-2">
      <Badge v-if="blocking.length" variant="destructive">
        {{ t("阻断批准 {count}", { count: blocking.length }) }}
      </Badge>
      <Badge v-if="needsReview.length" variant="outline">
        {{ t("需要复核 {count}", { count: needsReview.length }) }}
      </Badge>
      <Badge v-if="informational.length" variant="secondary">
        {{ t("提示 {count}", { count: informational.length }) }}
      </Badge>
    </div>
    <Collapsible v-if="candidate.findings.length > 0" v-model:open="open">
      <CollapsibleTrigger class="text-xs text-muted-foreground">
        {{ t("技术细节") }}
      </CollapsibleTrigger>
      <CollapsibleContent class="mt-2 space-y-2">
        <div
          v-for="finding in candidate.findings"
          :key="finding.id"
          class="rounded border p-2 text-xs"
        >
          <div class="font-medium">{{ finding.message }}</div>
          <div class="text-muted-foreground">
            {{ finding.ruleFamily }} · {{ finding.ruleId }} ·
            {{ finding.severity }} ·
            {{ finding.riskScore }}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
