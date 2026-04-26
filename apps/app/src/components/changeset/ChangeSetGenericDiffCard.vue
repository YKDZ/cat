<script setup lang="ts">
import { Badge } from "@cat/ui";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{
  entry: {
    id: number;
    entityType: string;
    entityId: string;
    action: string;
    before: unknown;
    after: unknown;
    fieldPath: string | null;
    riskLevel: string;
    reviewStatus: string;
    asyncStatus: string | null;
  };
}>();

const emit = defineEmits<{
  (e: "approve", entryId: number): void;
  (e: "reject", entryId: number): void;
}>();

const riskBadgeVariant = (risk: string) => {
  if (risk === "HIGH") return "destructive" as const;
  if (risk === "MEDIUM") return "secondary" as const;
  return "outline" as const;
};

const actionLabel = (action: string) => {
  if (action === "CREATE") return t("创建");
  if (action === "UPDATE") return t("更新");
  if (action === "DELETE") return t("删除");
  return action;
};

const formatJSON = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
</script>

<template>
  <div class="rounded-md border bg-card text-card-foreground shadow-sm">
    <div class="flex items-center justify-between border-b px-4 py-3">
      <div class="flex items-center gap-2 text-sm">
        <Badge variant="outline">{{ actionLabel(entry.action) }}</Badge>
        <span class="font-mono text-xs text-muted-foreground">{{
          entry.entityId
        }}</span>
        <Badge :variant="riskBadgeVariant(entry.riskLevel)">
          {{ t("{level} 风险", { level: entry.riskLevel }) }}
        </Badge>
        <Badge v-if="entry.asyncStatus === 'PENDING'" variant="secondary">
          {{ t("异步处理中") }}
        </Badge>
        <Badge v-else-if="entry.asyncStatus === 'FAILED'" variant="destructive">
          {{ t("异步失败") }}
        </Badge>
      </div>
      <div v-if="entry.reviewStatus === 'PENDING'" class="flex gap-2">
        <button
          class="rounded bg-green-100 px-2 py-1 text-xs text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300"
          @click="emit('approve', entry.id)"
        >
          {{ t("通过") }}
        </button>
        <button
          class="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300"
          @click="emit('reject', entry.id)"
        >
          {{ t("拒绝") }}
        </button>
      </div>
      <Badge
        v-else-if="entry.reviewStatus === 'APPROVED'"
        variant="outline"
        class="text-green-600"
      >
        {{ t("已通过") }}
      </Badge>
      <Badge
        v-else-if="entry.reviewStatus === 'REJECTED'"
        variant="destructive"
      >
        {{ t("已拒绝") }}
      </Badge>
    </div>
    <div class="grid grid-cols-2 gap-0 divide-x p-0 font-mono text-xs">
      <div class="p-3">
        <p class="mb-1 font-sans text-muted-foreground">{{ t("变更前") }}</p>
        <pre
          class="break-all whitespace-pre-wrap text-red-700 dark:text-red-400"
          >{{ formatJSON(entry.before) }}</pre
        >
      </div>
      <div class="p-3">
        <p class="mb-1 font-sans text-muted-foreground">{{ t("变更后") }}</p>
        <pre
          class="break-all whitespace-pre-wrap text-green-700 dark:text-green-400"
          >{{ formatJSON(entry.after) }}</pre
        >
      </div>
    </div>
  </div>
</template>
