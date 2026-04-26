<script setup lang="ts">
import { Badge } from "@cat/ui";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

type Entry = {
  id: number;
  riskLevel: string;
  reviewStatus: string;
};

const props = defineProps<{
  status: string;
  entries: Entry[];
}>();

const counts = computed(() => ({
  total: props.entries.length,
  approved: props.entries.filter((e) => e.reviewStatus === "APPROVED").length,
  rejected: props.entries.filter((e) => e.reviewStatus === "REJECTED").length,
  pending: props.entries.filter((e) => e.reviewStatus === "PENDING").length,
  high: props.entries.filter((e) => e.riskLevel === "HIGH").length,
  medium: props.entries.filter((e) => e.riskLevel === "MEDIUM").length,
}));

const statusVariant = (s: string) => {
  if (s === "APPROVED" || s === "APPLIED") return "outline" as const;
  if (s === "REJECTED") return "destructive" as const;
  return "secondary" as const;
};
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3"
  >
    <Badge :variant="statusVariant(status)">{{
      t("状态: {s}", { s: status })
    }}</Badge>
    <span class="text-sm text-muted-foreground">
      {{ t("{total} 条变更", { total: counts.total }) }}
    </span>
    <span v-if="counts.approved > 0" class="text-sm text-green-600">
      {{ t("{n} 通过", { n: counts.approved }) }}
    </span>
    <span v-if="counts.rejected > 0" class="text-sm text-red-600">
      {{ t("{n} 拒绝", { n: counts.rejected }) }}
    </span>
    <span v-if="counts.pending > 0" class="text-sm text-muted-foreground">
      {{ t("{n} 待审", { n: counts.pending }) }}
    </span>
    <div class="ml-auto flex gap-2">
      <Badge v-if="counts.high > 0" variant="destructive">
        {{ t("{n} 高风险", { n: counts.high }) }}
      </Badge>
      <Badge v-if="counts.medium > 0" variant="secondary">
        {{ t("{n} 中风险", { n: counts.medium }) }}
      </Badge>
    </div>
  </div>
</template>
