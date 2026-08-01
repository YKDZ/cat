<script setup lang="ts">
import type { OperationFailure, TaskStatus } from "@cat/shared";
import { useData } from "vike-vue/useData";
import { computed, ref } from "vue";

import type { TaskTableRow } from "#/components/TaskTable.vue";
import TaskTable from "#/components/TaskTable.vue";
import { orpc } from "#/rpc/orpc.ts";

import ProjectPageDataError from "../ProjectPageDataError.vue";
import type { Data } from "./+data.ts";

const data = useData<Data>();
const pageError = computed(() => data.pageError);
const projectId = data.projectId;
const pageIndex = ref(0);
const status = ref<TaskStatus>();
const loading = ref(false);
const actionTaskId = ref<string>();
const actionError = ref<string>();
type Cursor = { updatedAt: string; id: string };
type TaskDetail = {
  task: TaskTableRow;
  currentFailure: Partial<OperationFailure> | null;
};
const selectedDetail = ref<TaskDetail>();
const cursors = ref<Array<Cursor | undefined>>([undefined]);
const tasks = ref(
  data.tasks ?? { items: [], hasMore: false, nextCursor: null },
);

const load = async () => {
  if (!projectId) return;
  loading.value = true;
  try {
    const cursor = cursors.value[pageIndex.value];
    tasks.value = await orpc.task.list({
      projectId,
      pageSize: 20,
      ...(cursor === undefined ? {} : { cursor }),
      ...(status.value === undefined ? {} : { status: status.value }),
    });
  } finally {
    loading.value = false;
  }
};

const changeStatus = async (value: string | undefined) => {
  status.value = value as TaskStatus | undefined;
  pageIndex.value = 0;
  cursors.value = [undefined];
  await load();
};

const showDetail = async (taskId: string) => {
  if (!projectId) return;
  selectedDetail.value = await orpc.task.detail({ projectId, taskId });
};

const refreshSelected = async () => {
  if (!selectedDetail.value) return;
  await showDetail(selectedDetail.value.task.id);
};

const actionMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const cancel = async (task: TaskTableRow) => {
  if (!projectId) return;
  actionTaskId.value = task.id;
  actionError.value = undefined;
  try {
    await orpc.task.cancel({
      projectId,
      taskId: task.id,
      requestId: crypto.randomUUID(),
    });
    await Promise.all([load(), refreshSelected()]);
  } catch (error) {
    actionError.value = actionMessage(error);
  } finally {
    actionTaskId.value = undefined;
  }
};

const retry = async (task: TaskTableRow) => {
  if (!projectId) return;
  actionTaskId.value = task.id;
  actionError.value = undefined;
  try {
    const retried = await orpc.task.retry({ projectId, taskId: task.id });
    await load();
    await showDetail(retried.id);
  } catch (error) {
    actionError.value = actionMessage(error);
  } finally {
    actionTaskId.value = undefined;
  }
};

const resume = async (task: TaskTableRow) => {
  if (!projectId) return;
  actionTaskId.value = task.id;
  actionError.value = undefined;
  try {
    const resumed = await orpc.task.resume({
      projectId,
      taskId: task.id,
      requestId: crypto.randomUUID(),
    });
    await load();
    await showDetail(resumed.id);
  } catch (error) {
    actionError.value = actionMessage(error);
  } finally {
    actionTaskId.value = undefined;
  }
};

const previous = async () => {
  pageIndex.value -= 1;
  await load();
};

const next = async () => {
  if (!tasks.value.nextCursor) return;
  cursors.value[pageIndex.value + 1] = tasks.value.nextCursor;
  pageIndex.value += 1;
  await load();
};

const timestamp = (value: Date | string | null): string =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(value))
    : "-";

const serviceLabel = (reference: {
  pluginId: string;
  serviceId: string;
}): string => `${reference.pluginId} · ${reference.serviceId}`;
</script>

<template>
  <ProjectPageDataError v-if="pageError" :message="pageError.message" />
  <section v-else class="space-y-4 p-4">
    <TaskTable
      :data="tasks.items"
      :has-previous="pageIndex > 0"
      :has-more="tasks.hasMore"
      :loading="loading"
      :status="status"
      :action-task-id="actionTaskId"
      :action-error="actionError"
      @refresh="load"
      @update:status="changeStatus"
      @previous="previous"
      @next="next"
      @detail="showDetail"
      @cancel="cancel"
      @retry="retry"
      @resume="resume"
    />
    <section
      v-if="selectedDetail"
      class="border-t pt-4 text-sm"
      :aria-label="$t('任务详情')"
    >
      <h2 class="mb-3 text-base font-semibold">{{ $t("任务详情") }}</h2>
      <dl class="grid gap-x-6 gap-y-2 md:grid-cols-[10rem_1fr_10rem_1fr]">
        <dt class="text-muted-foreground">{{ $t("任务 ID") }}</dt>
        <dd class="break-all">{{ selectedDetail.task.id }}</dd>
        <dt class="text-muted-foreground">{{ $t("状态") }}</dt>
        <dd>{{ selectedDetail.task.state.status }}</dd>
        <dt class="text-muted-foreground">{{ $t("阶段") }}</dt>
        <dd>{{ selectedDetail.task.state.runtime.phase ?? $t("无") }}</dd>
        <dt class="text-muted-foreground">{{ $t("进度") }}</dt>
        <dd>
          {{ selectedDetail.task.state.progressCurrent ?? 0 }} /
          {{ selectedDetail.task.state.progressTotal ?? 0 }}
        </dd>
        <dt class="text-muted-foreground">{{ $t("执行者") }}</dt>
        <dd class="break-all">
          {{ selectedDetail.task.state.actor.type }} ·
          {{ selectedDetail.task.state.actor.id ?? $t("系统") }}
        </dd>
        <dt class="text-muted-foreground">{{ $t("运行 ID") }}</dt>
        <dd class="break-all">
          {{ selectedDetail.task.state.runtime.runId ?? $t("无") }}
        </dd>
        <dt class="text-muted-foreground">{{ $t("语言") }}</dt>
        <dd>{{ selectedDetail.task.task.payload.invocation.languageId }}</dd>
        <dt class="text-muted-foreground">{{ $t("排序") }}</dt>
        <dd>{{ selectedDetail.task.task.payload.invocation.sortMode }}</dd>
        <dt class="text-muted-foreground">{{ $t("创建时间") }}</dt>
        <dd>{{ timestamp(selectedDetail.task.createdAt) }}</dd>
        <dt class="text-muted-foreground">{{ $t("更新时间") }}</dt>
        <dd>{{ timestamp(selectedDetail.task.updatedAt) }}</dd>
        <dt class="text-muted-foreground">{{ $t("开始时间") }}</dt>
        <dd>{{ timestamp(selectedDetail.task.startedAt) }}</dd>
        <dt class="text-muted-foreground">{{ $t("完成时间") }}</dt>
        <dd>{{ timestamp(selectedDetail.task.finishedAt) }}</dd>
        <dt class="text-muted-foreground">{{ $t("重试来源") }}</dt>
        <dd class="break-all">
          {{ selectedDetail.task.state.retryOfTaskId ?? $t("无") }}
        </dd>
        <dt class="text-muted-foreground">{{ $t("修订版本") }}</dt>
        <dd>{{ selectedDetail.task.state.revision }}</dd>
      </dl>

      <div class="mt-4 grid gap-4 lg:grid-cols-4">
        <section>
          <h3 class="mb-2 font-medium">{{ $t("调用参数") }}</h3>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt class="text-muted-foreground">{{ $t("元素") }}</dt>
            <dd>
              {{
                selectedDetail.task.task.payload.invocation.elementIds.length
              }}
            </dd>
            <dt class="text-muted-foreground">{{ $t("内容节点") }}</dt>
            <dd>
              {{
                selectedDetail.task.task.payload.invocation.contentNodeIds
                  .length
              }}
            </dd>
            <dt class="text-muted-foreground">{{ $t("最低相似度") }}</dt>
            <dd>
              {{
                selectedDetail.task.task.payload.invocation.minMemorySimilarity
              }}
            </dd>
            <dt class="text-muted-foreground">{{ $t("记忆数量") }}</dt>
            <dd>
              {{ selectedDetail.task.task.payload.invocation.maxMemoryAmount }}
              ·
              {{ selectedDetail.task.task.payload.invocation.memoryIds.length }}
            </dd>
            <dt class="text-muted-foreground">{{ $t("术语库") }}</dt>
            <dd>
              {{
                selectedDetail.task.task.payload.invocation.glossaryIds.length
              }}
            </dd>
            <dt class="text-muted-foreground">{{ $t("向量存储") }}</dt>
            <dd class="break-all">
              {{
                serviceLabel(
                  selectedDetail.task.task.payload.invocation
                    .memoryVectorStorage,
                )
              }}
            </dd>
            <dt class="text-muted-foreground">{{ $t("向量化") }}</dt>
            <dd class="break-all">
              {{
                serviceLabel(
                  selectedDetail.task.task.payload.invocation.vectorizer,
                )
              }}
            </dd>
          </dl>
        </section>
        <section>
          <h3 class="mb-2 font-medium">{{ $t("受影响资源") }}</h3>
          <p
            v-if="selectedDetail.task.state.resources.length === 0"
            class="text-muted-foreground"
          >
            {{ $t("无") }}
          </p>
          <ul v-else class="space-y-1">
            <li
              v-for="resource in selectedDetail.task.state.resources"
              :key="`${resource.type}:${resource.id}`"
              class="break-all"
            >
              {{ resource.type }} · {{ resource.id }}
            </li>
          </ul>
        </section>
        <section>
          <h3 class="mb-2 font-medium">{{ $t("结果") }}</h3>
          <template v-if="selectedDetail.task.state.runtime.result">
            <p>
              {{ $t("翻译") }}:
              {{
                selectedDetail.task.state.runtime.result.translationIds.length
              }}
            </p>
            <p>
              {{ $t("已处理元素") }}:
              {{
                selectedDetail.task.state.runtime.result.translatedElementIds
                  .length
              }}
            </p>
            <p>
              {{ $t("已跳过元素") }}:
              {{
                selectedDetail.task.state.runtime.result.skippedElementIds
                  .length
              }}
            </p>
          </template>
          <p v-else class="text-muted-foreground">{{ $t("无") }}</p>
        </section>
        <section>
          <h3 class="mb-2 font-medium">{{ $t("当前失败") }}</h3>
          <template v-if="selectedDetail.currentFailure">
            <p class="font-medium">{{ selectedDetail.currentFailure.code }}</p>
            <p>{{ selectedDetail.currentFailure.message }}</p>
            <p class="mt-2 text-muted-foreground">
              {{ selectedDetail.currentFailure.severity }} ·
              {{
                selectedDetail.currentFailure.retryable
                  ? $t("可重试")
                  : $t("不可重试")
              }}
            </p>
            <p v-if="selectedDetail.currentFailure.blocker">
              {{ selectedDetail.currentFailure.blocker }}
            </p>
            <p v-if="selectedDetail.currentFailure.capability">
              {{ selectedDetail.currentFailure.capability }}
            </p>
            <p v-if="selectedDetail.currentFailure.authorizationDecision">
              {{ selectedDetail.currentFailure.authorizationDecision }}
            </p>
            <p
              v-if="selectedDetail.currentFailure.remediationHint"
              class="mt-2"
            >
              {{ selectedDetail.currentFailure.remediationHint }}
            </p>
          </template>
          <p v-else class="text-muted-foreground">{{ $t("无") }}</p>
        </section>
      </div>
    </section>
  </section>
</template>
