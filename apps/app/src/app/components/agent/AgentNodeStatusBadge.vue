<script setup lang="ts">
import { Badge } from "@cat/ui";
import { useI18n } from "vue-i18n";

defineProps<{
  status: "pending" | "running" | "paused" | "completed" | "error";
}>();

const { t } = useI18n();

const variantOf = (status: string): "secondary" | "outline" | "destructive" => {
  if (status === "error") return "destructive";
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
    case "error":
      return t("失败");
    default:
      return status;
  }
};
</script>

<template>
  <Badge :variant="variantOf(status)" class="h-4 px-1 text-[10px]">
    {{ labelOf(status) }}
  </Badge>
</template>
