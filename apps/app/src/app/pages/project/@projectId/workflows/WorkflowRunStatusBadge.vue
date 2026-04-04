<script setup lang="ts">
import { Badge } from "@cat/ui";
import { useI18n } from "vue-i18n";

defineProps<{
  status: string;
}>();

const { t } = useI18n();

const variantOf = (status: string): "secondary" | "outline" | "destructive" => {
  if (status === "failed") return "destructive";
  if (status === "completed") return "secondary";
  return "outline";
};

const labelOf = (status: string): string => {
  switch (status) {
    case "pending":
      return t("等待中");
    case "running":
      return t("执行中");
    case "paused":
      return t("已暂停");
    case "completed":
      return t("已完成");
    case "failed":
      return t("失败");
    case "cancelled":
      return t("已取消");
    default:
      return status;
  }
};
</script>

<template>
  <Badge :variant="variantOf(status)" class="h-5 px-1.5 text-[11px]">
    {{ labelOf(status) }}
  </Badge>
</template>
