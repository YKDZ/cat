<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Badge, Button } from "@cat/app-ui";
import {
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  XCircle,
} from "lucide-vue-next";

export interface AgentRunResultInfo {
  status: "completed" | "cancelled" | "failed";
  message?: string | null;
}

const props = defineProps<{
  result: AgentRunResultInfo;
}>();

const emit = defineEmits<{
  retry: [];
}>();

const { t } = useI18n();

const tone = computed(() => {
  if (props.result.status === "completed") return "success" as const;
  if (props.result.status === "cancelled") return "warning" as const;
  return "error" as const;
});

const label = computed(() => {
  if (props.result.status === "completed") return t("运行完成");
  if (props.result.status === "cancelled") return t("运行已取消");
  return t("运行失败");
});

const description = computed(() => {
  if (props.result.message && props.result.message.trim().length > 0) {
    return props.result.message;
  }

  if (props.result.status === "completed") {
    return t("Graph 执行已结束。你可以继续发送新消息。");
  }
  if (props.result.status === "cancelled") {
    return t("当前运行被取消。可重新发起新的执行。");
  }
  return t("Graph 执行过程中出现错误。可重试或检查日志。");
});

const handleRetry = () => {
  emit("retry");
};
</script>

<template>
  <div
    class="rounded-lg border p-3"
    :class="[
      tone === 'success' && 'border-green-500/40 bg-green-500/5',
      tone === 'warning' && 'border-yellow-500/40 bg-yellow-500/5',
      tone === 'error' && 'border-destructive/40 bg-destructive/5',
    ]"
  >
    <div class="mb-1.5 flex items-center gap-2">
      <CheckCircle2
        v-if="tone === 'success'"
        class="size-4 shrink-0 text-green-600"
      />
      <AlertTriangle
        v-else-if="tone === 'warning'"
        class="size-4 shrink-0 text-yellow-600"
      />
      <XCircle v-else class="size-4 shrink-0 text-destructive" />

      <span class="flex-1 text-xs font-medium">{{ t("运行结果") }}</span>
      <Badge variant="outline" class="h-5 px-1.5 text-[10px]">
        {{ label }}
      </Badge>
    </div>

    <p class="text-xs text-muted-foreground">
      {{ description }}
    </p>

    <div v-if="tone !== 'success'" class="mt-2 flex items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        class="h-7 text-xs"
        @click="handleRetry"
      >
        <RotateCcw class="mr-1 size-3" />
        {{ t("重试") }}
      </Button>
    </div>
  </div>
</template>
