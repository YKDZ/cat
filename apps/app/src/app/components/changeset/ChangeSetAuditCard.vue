<script setup lang="ts">
import { Badge } from "@cat/ui";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

type ChangesetStatus =
  | "PENDING"
  | "APPROVED"
  | "PARTIALLY_APPROVED"
  | "REJECTED"
  | "APPLIED"
  | "CONFLICT";

const props = defineProps<{
  changeset: {
    id: number;
    externalId: string;
    status: ChangesetStatus;
    summary: string | null;
    asyncStatus: string | null;
    createdAt: Date | string;
    agentRunId: number | null;
    linkedCardId: number | null;
  };
}>();

const emit = defineEmits<{
  (e: "view", externalId: string): void;
}>();

const statusVariant = computed(
  (): "default" | "secondary" | "destructive" | "outline" => {
    switch (props.changeset.status) {
      case "APPROVED":
      case "APPLIED":
        return "default";
      case "REJECTED":
      case "CONFLICT":
        return "destructive";
      case "PARTIALLY_APPROVED":
        return "secondary";
      default:
        return "outline";
    }
  },
);

const statusLabel = computed(() => {
  const labels: Record<ChangesetStatus, string> = {
    PENDING: t("待审核"),
    APPROVED: t("已批准"),
    PARTIALLY_APPROVED: t("部分批准"),
    REJECTED: t("已拒绝"),
    APPLIED: t("已应用"),
    CONFLICT: t("冲突"),
  };
  return labels[props.changeset.status] ?? props.changeset.status;
});

const shortId = computed(() => props.changeset.externalId.slice(0, 8));

const formattedDate = computed(() => {
  const d = new Date(props.changeset.createdAt);
  return d.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
});
</script>

<template>
  <div
    class="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/30"
  >
    <div class="flex items-start justify-between gap-3">
      <!-- Left: info -->
      <div class="flex min-w-0 flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2">
          <Badge :variant="statusVariant">{{ statusLabel }}</Badge>
          <Badge v-if="changeset.asyncStatus" variant="outline" class="text-xs">
            {{ changeset.asyncStatus }}
          </Badge>
          <span class="font-mono text-xs text-muted-foreground"
            >#{{ shortId }}</span
          >
        </div>
        <p
          v-if="changeset.summary"
          class="mt-1 line-clamp-2 text-sm text-foreground"
        >
          {{ changeset.summary }}
        </p>
        <p v-else class="mt-1 text-sm text-muted-foreground italic">
          {{ t("无摘要") }}
        </p>
        <div class="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{{ formattedDate }}</span>
          <span v-if="changeset.agentRunId">{{
            t("智能体运行 #{id}", { id: changeset.agentRunId })
          }}</span>
          <span v-if="changeset.linkedCardId">{{
            t("关联卡片 #{id}", { id: changeset.linkedCardId })
          }}</span>
        </div>
      </div>

      <!-- Right: action -->
      <button
        class="shrink-0 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-muted/50"
        @click="emit('view', changeset.externalId)"
      >
        {{ t("查看") }}
      </button>
    </div>
  </div>
</template>
