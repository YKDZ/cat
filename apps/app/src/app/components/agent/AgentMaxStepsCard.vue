<script setup lang="ts">
import { Button, Input } from "@cat/ui";
import { AlertTriangle, Play, X } from "lucide-vue-next";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import type { MaxStepsReachedInfo } from "@/app/stores/agent";

import { useAgentStore } from "@/app/stores/agent";

defineProps<{
  info: MaxStepsReachedInfo;
}>();


const { t } = useI18n();
const agentStore = useAgentStore();


const additionalSteps = ref(10);


const handleContinue = () => {
  void agentStore.extendAndContinue();
};


const handleTerminate = () => {
  agentStore.cancelStreaming();
};
</script>

<template>
  <div
    class="rounded-lg border border-yellow-500/50 bg-yellow-50/10 shadow-sm dark:bg-yellow-900/10"
  >
    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-2">
      <AlertTriangle class="size-4 shrink-0 text-yellow-500" />
      <span class="flex-1 text-xs font-medium">
        {{ t("已达到最大步数限制") }}
      </span>
    </div>

    <!-- Description -->
    <p class="px-3 pb-2 text-[11px] leading-snug text-muted-foreground">
      {{
        t(
          "Agent 已执行 {count} 步但尚未完成任务。你可以增加步数继续执行或直接终止。",
          { count: info.totalSteps },
        )
      }}
    </p>

    <!-- Actions -->
    <div class="flex items-center gap-1.5 border-t px-3 py-2">
      <div class="flex items-center gap-1">
        <Button
          size="sm"
          variant="default"
          class="text-xs"
          @click="handleContinue"
        >
          <Play class="mr-1 size-3" />
          {{ t("继续") }}
        </Button>
        <Input
          v-model.number="additionalSteps"
          type="number"
          :min="1"
          :max="100"
          class="h-7 w-16 text-xs"
        />
        <span class="text-[11px] text-muted-foreground">{{ t("步") }}</span>
      </div>

      <Button
        size="sm"
        variant="ghost"
        class="text-xs"
        @click="handleTerminate"
      >
        <X class="mr-1 size-3" />
        {{ t("终止") }}
      </Button>
    </div>
  </div>
</template>
