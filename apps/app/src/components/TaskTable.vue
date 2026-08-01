<script setup lang="ts">
import type { TaskKind, TaskState } from "@cat/shared";
import { Button } from "@cat/ui";
import { LoaderCircle, Play, RefreshCw, RotateCcw, X } from "@lucide/vue";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

export type TaskTableRow = {
  id: string;
  task: TaskKind;
  state: TaskState;
  createdAt: Date | string;
  updatedAt: Date | string;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
};

const props = defineProps<{
  data: TaskTableRow[];
  hasPrevious: boolean;
  hasMore: boolean;
  loading?: boolean | undefined;
  status?: string | undefined;
  actionTaskId?: string | undefined;
  actionError?: string | undefined;
}>();

const emit = defineEmits<{
  refresh: [];
  "update:status": [status: string | undefined];
  previous: [];
  next: [];
  detail: [taskId: string];
  cancel: [task: TaskTableRow];
  retry: [task: TaskTableRow];
  resume: [task: TaskTableRow];
}>();

const { t } = useI18n();

const statusValue = computed({
  get: () => props.status ?? "",
  set: (value: string) => emit("update:status", value || undefined),
});

const taskLabel = (task: TaskKind): string => {
  if (task.kind === "BATCH_AUTO_TRANSLATION") return t("批量自动翻译");
  return task.kind;
};

const progress = (state: TaskState): string => {
  if (state.progressCurrent === null || state.progressTotal === null)
    return t("无");
  return `${state.progressCurrent} / ${state.progressTotal}`;
};

const timestamp = (value: Date | string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <select
        v-model="statusValue"
        class="h-9 border px-2"
        :aria-label="t('状态')"
      >
        <option value="">{{ t("全部状态") }}</option>
        <option value="PENDING">{{ t("等待中") }}</option>
        <option value="RUNNING">{{ t("运行中") }}</option>
        <option value="BLOCKED">{{ t("已阻塞") }}</option>
        <option value="CANCEL_REQUESTED">{{ t("取消请求中") }}</option>
        <option value="COMPLETED">{{ t("已完成") }}</option>
        <option value="FAILED">{{ t("失败") }}</option>
        <option value="CANCELED">{{ t("已取消") }}</option>
      </select>
      <Button
        size="icon"
        variant="outline"
        :disabled="loading"
        :title="t('刷新')"
        @click="emit('refresh')"
      >
        <RefreshCw class="size-4" />
      </Button>
    </div>

    <div class="overflow-x-auto border">
      <table class="w-full text-sm">
        <thead class="border-b text-left">
          <tr>
            <th class="px-3 py-2">{{ t("任务") }}</th>
            <th class="px-3 py-2">{{ t("状态") }}</th>
            <th class="px-3 py-2">{{ t("进度") }}</th>
            <th class="px-3 py-2">{{ t("更新时间") }}</th>
            <th class="px-3 py-2">
              <span class="sr-only">{{ t("操作") }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="task in data"
            :key="task.id"
            class="border-b last:border-0"
          >
            <td class="px-3 py-2">
              <button
                class="text-left underline"
                @click="emit('detail', task.id)"
              >
                {{ taskLabel(task.task) }}
              </button>
            </td>
            <td class="px-3 py-2">{{ task.state.status }}</td>
            <td class="px-3 py-2">{{ progress(task.state) }}</td>
            <td class="px-3 py-2">{{ timestamp(task.updatedAt) }}</td>
            <td class="px-3 py-2 text-right">
              <Button
                v-if="
                  task.state.status === 'PENDING' ||
                  task.state.status === 'RUNNING' ||
                  task.state.status === 'BLOCKED'
                "
                size="icon"
                variant="ghost"
                :disabled="actionTaskId === task.id"
                :title="t('取消')"
                @click="emit('cancel', task)"
                ><LoaderCircle
                  v-if="actionTaskId === task.id"
                  class="size-4 animate-spin" /><X v-else class="size-4"
              /></Button>
              <Button
                v-if="task.state.status === 'BLOCKED'"
                size="icon"
                variant="ghost"
                :disabled="actionTaskId === task.id"
                :title="t('恢复')"
                @click="emit('resume', task)"
                ><LoaderCircle
                  v-if="actionTaskId === task.id"
                  class="size-4 animate-spin" /><Play v-else class="size-4"
              /></Button>
              <Button
                v-else-if="task.state.status === 'FAILED'"
                size="icon"
                variant="ghost"
                :disabled="actionTaskId === task.id"
                :title="t('重试')"
                @click="emit('retry', task)"
                ><LoaderCircle
                  v-if="actionTaskId === task.id"
                  class="size-4 animate-spin" /><RotateCcw
                  v-else
                  class="size-4"
              /></Button>
            </td>
          </tr>
          <tr v-if="!loading && data.length === 0">
            <td colspan="5" class="px-3 py-8 text-center text-muted-foreground">
              {{ t("没有任务") }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="actionError" class="text-sm text-destructive" role="alert">
      {{ actionError }}
    </p>

    <div class="flex items-center justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        :disabled="loading || !hasPrevious"
        @click="emit('previous')"
        >{{ t("上一页") }}</Button
      >
      <Button
        size="sm"
        variant="outline"
        :disabled="loading || !hasMore"
        @click="emit('next')"
        >{{ t("下一页") }}</Button
      >
    </div>
  </div>
</template>
