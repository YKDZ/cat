<script setup lang="ts">
import { Button } from "@cat/ui";
import { ArrowRight, ArrowDown, Pause, Play, X } from "@lucide/vue";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { useWorkflowStore } from "@/stores/workflow";

import WorkflowRunStatusBadge from "../WorkflowRunStatusBadge.vue";

const props = defineProps<{
  runId: string;
  direction: "DOWN" | "RIGHT";
}>();

const emit = defineEmits<{
  "update:direction": ["DOWN" | "RIGHT"];
}>();

const { t } = useI18n();
const workflowStore = useWorkflowStore();

const status = computed(() => workflowStore.runStatus);
const isRunning = computed(() => status.value === "running");
const isPaused = computed(() => status.value === "paused");
const isActive = computed(() => isRunning.value || isPaused.value);

const handlePause = async (): Promise<void> => {
  await workflowStore.pauseRun(props.runId);
};

const handleResume = async (): Promise<void> => {
  await workflowStore.resumeRun(props.runId);
};

const handleCancel = async (): Promise<void> => {
  await workflowStore.cancelRun(props.runId);
};

const toggleDirection = (): void => {
  emit("update:direction", props.direction === "DOWN" ? "RIGHT" : "DOWN");
};
</script>

<template>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <WorkflowRunStatusBadge :status="status" />
      <span class="font-mono text-xs text-muted-foreground">{{
        props.runId
      }}</span>
    </div>

    <div class="flex items-center gap-2 pb-2">
      <!-- Layout direction toggle -->
      <Button
        variant="outline"
        size="sm"
        :title="t('布局方向')"
        @click="toggleDirection"
      >
        <component
          :is="direction === 'DOWN' ? ArrowDown : ArrowRight"
          class="size-4"
        />
        <span class="ml-1 text-xs">
          {{ direction === "DOWN" ? t("从上到下") : t("从左到右") }}
        </span>
      </Button>

      <!-- Pause / Resume -->
      <Button v-if="isRunning" variant="outline" size="sm" @click="handlePause">
        <Pause class="mr-1 size-4" />
        {{ t("暂停") }}
      </Button>

      <Button v-if="isPaused" variant="outline" size="sm" @click="handleResume">
        <Play class="mr-1 size-4" />
        {{ t("恢复") }}
      </Button>

      <!-- Cancel -->
      <Button
        v-if="isActive"
        variant="outline"
        size="sm"
        class="text-destructive hover:bg-destructive/10"
        @click="handleCancel"
      >
        <X class="mr-1 size-4" />
        {{ t("取消") }}
      </Button>
    </div>
  </div>
</template>
