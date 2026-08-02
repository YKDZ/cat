<script setup lang="ts">
import type {
  BatchAutoTranslationTaskPhase,
  RecallDerivationTaskPhase,
  ElementSortMode,
  OperationFailure,
  OperationFailureAuthorizationDecision,
  OperationFailureBlocker,
  OperationFailureCapability,
  OperationFailureCode,
  OperationFailureSeverity,
  TaskActor,
  TaskAffectedResource,
  TaskKindName,
  TaskStatus,
} from "@cat/shared";
import { useData } from "vike-vue/useData";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import * as z from "zod";

import type { TaskTableRow } from "#/components/TaskTable.vue";
import TaskTable from "#/components/TaskTable.vue";
import { orpc } from "#/rpc/orpc.ts";

import ProjectPageDataError from "../ProjectPageDataError.vue";
import type { Data } from "./+data.ts";

const data = useData<Data>();
const { t } = useI18n();
const pageError = computed(() => data.pageError);
const projectId = data.projectId;
const pageIndex = ref(0);
const status = ref<TaskStatus>();
const kind = ref<TaskKindName>();
const loading = ref(false);
const listError = ref<string>();
const actionTaskId = ref<string>();
const actionError = ref<string>();
const actionBusy = ref(false);
const listRequestVersion = ref(0);
const detailRequestVersion = ref(0);
type Cursor = { updatedAt: string; id: string };
type TaskDetail = {
  task: TaskTableRow;
  currentFailure: Partial<OperationFailure> | null;
};
const selectedDetail = ref<TaskDetail | undefined>(data.selectedDetail);
const detailAvailability = ref<"invalid" | "loading" | "unavailable" | null>(
  data.detailAvailability ?? null,
);
const cursors = ref<Array<Cursor | undefined>>([undefined]);
const tasks = ref(
  data.tasks ?? { items: [], hasMore: false, nextCursor: null },
);
type CommittedListSnapshot = {
  cursors: Array<Cursor | undefined>;
  pageIndex: number;
  status: TaskStatus | undefined;
  kind: TaskKindName | undefined;
  tasks: typeof tasks.value;
};
const committedList = ref<CommittedListSnapshot>({
  cursors: cursors.value,
  pageIndex: pageIndex.value,
  status: status.value,
  kind: kind.value,
  tasks: tasks.value,
});
const commitList = () => {
  committedList.value = {
    cursors: [...cursors.value],
    pageIndex: pageIndex.value,
    status: status.value,
    kind: kind.value,
    tasks: tasks.value,
  };
};
const restoreCommittedList = () => {
  const committed = committedList.value;
  cursors.value = [...committed.cursors];
  pageIndex.value = committed.pageIndex;
  status.value = committed.status;
  kind.value = committed.kind;
  tasks.value = committed.tasks;
};

const load = async () => {
  if (!projectId) return;
  const requestVersion = listRequestVersion.value + 1;
  listRequestVersion.value = requestVersion;
  loading.value = true;
  listError.value = undefined;
  try {
    const cursor = cursors.value[pageIndex.value];
    const result = await orpc.task.list({
      projectId,
      pageSize: 20,
      ...(cursor === undefined ? {} : { cursor }),
      ...(status.value === undefined ? {} : { status: status.value }),
      ...(kind.value === undefined ? {} : { kind: kind.value }),
    });
    if (requestVersion === listRequestVersion.value) {
      tasks.value = result;
      commitList();
    }
  } catch {
    if (requestVersion === listRequestVersion.value) {
      listError.value = t("任务列表暂时无法加载，请重试");
    }
  } finally {
    if (requestVersion === listRequestVersion.value) loading.value = false;
  }
};

const changeFilters = async (input: {
  status: TaskStatus | undefined;
  kind: TaskKindName | undefined;
}) => {
  if (!projectId) return;
  const requestVersion = listRequestVersion.value + 1;
  listRequestVersion.value = requestVersion;
  status.value = input.status;
  kind.value = input.kind;
  pageIndex.value = 0;
  cursors.value = [undefined];
  loading.value = true;
  listError.value = undefined;
  try {
    const result = await orpc.task.list({
      projectId,
      pageSize: 20,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.kind === undefined ? {} : { kind: input.kind }),
    });
    if (requestVersion === listRequestVersion.value) {
      tasks.value = result;
      commitList();
    }
  } catch {
    if (requestVersion === listRequestVersion.value) {
      restoreCommittedList();
      listError.value = t("任务列表暂时无法加载，请重试");
    }
  } finally {
    if (requestVersion === listRequestVersion.value) loading.value = false;
  }
};

const changeStatus = async (value: TaskStatus | undefined) =>
  await changeFilters({ status: value, kind: kind.value });

const changeKind = async (value: TaskKindName | undefined) =>
  await changeFilters({ status: status.value, kind: value });

const showDetail = async (taskId: string): Promise<TaskDetail | undefined> => {
  const requestVersion = detailRequestVersion.value + 1;
  detailRequestVersion.value = requestVersion;
  if (!projectId) return undefined;
  selectedDetail.value = undefined;
  detailAvailability.value = "loading";
  try {
    const detail = await orpc.task.detail({ projectId, taskId });
    if (requestVersion !== detailRequestVersion.value) return undefined;
    selectedDetail.value = detail;
    detailAvailability.value = null;
    return detail;
  } catch {
    if (requestVersion === detailRequestVersion.value) {
      selectedDetail.value = undefined;
      detailAvailability.value = "unavailable";
    }
    return undefined;
  }
};

const taskIdFromSearch = (search: string): string | undefined => {
  const taskId = new URLSearchParams(search).get("taskId");
  return taskId && z.uuidv4().safeParse(taskId).success ? taskId : undefined;
};

const openDetail = async (taskId: string) => {
  const selected = await showDetail(taskId);
  if (selected === undefined) return;

  const url = new URL(globalThis.location.href);
  if (url.searchParams.get("taskId") === taskId) return;
  url.searchParams.set("taskId", taskId);
  globalThis.history.pushState(
    globalThis.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
};

const openTaskFromSearch = (search: string) => {
  const searchParams = new URLSearchParams(search);
  const requestedTaskId = searchParams.get("taskId");
  const taskId = taskIdFromSearch(search);
  if (!taskId) {
    detailRequestVersion.value += 1;
    selectedDetail.value = undefined;
    detailAvailability.value = requestedTaskId === null ? null : "invalid";
    return;
  }

  void showDetail(taskId);
};

const restoreDetailFromHistory = () =>
  openTaskFromSearch(globalThis.location.search);

onMounted(() => {
  globalThis.addEventListener("popstate", restoreDetailFromHistory);
});

onBeforeUnmount(() => {
  detailRequestVersion.value += 1;
  globalThis.removeEventListener("popstate", restoreDetailFromHistory);
});

const refreshSelected = async () => {
  if (!selectedDetail.value) return;
  await showDetail(selectedDetail.value.task.id);
};

const retryDetail = async () => {
  const taskId = taskIdFromSearch(globalThis.location.search);
  if (taskId) await showDetail(taskId);
};

const cancel = async (task: TaskTableRow) => {
  if (!projectId || actionBusy.value) return;
  actionBusy.value = true;
  actionTaskId.value = task.id;
  actionError.value = undefined;
  try {
    await orpc.task.cancel({
      projectId,
      taskId: task.id,
      requestId: crypto.randomUUID(),
    });
    await Promise.all([load(), refreshSelected()]);
  } catch {
    actionError.value = t("任务操作未完成，请重试");
  } finally {
    actionTaskId.value = undefined;
    actionBusy.value = false;
  }
};

const retry = async (task: TaskTableRow) => {
  if (!projectId || actionBusy.value) return;
  actionBusy.value = true;
  actionTaskId.value = task.id;
  actionError.value = undefined;
  try {
    const retried = await orpc.task.retry({ projectId, taskId: task.id });
    await load();
    await openDetail(retried.id);
  } catch {
    actionError.value = t("任务操作未完成，请重试");
  } finally {
    actionTaskId.value = undefined;
    actionBusy.value = false;
  }
};

const resume = async (task: TaskTableRow) => {
  if (!projectId || actionBusy.value) return;
  actionBusy.value = true;
  actionTaskId.value = task.id;
  actionError.value = undefined;
  try {
    const resumed = await orpc.task.resume({
      projectId,
      taskId: task.id,
      requestId: crypto.randomUUID(),
    });
    await load();
    await openDetail(resumed.id);
  } catch {
    actionError.value = t("任务操作未完成，请重试");
  } finally {
    actionTaskId.value = undefined;
    actionBusy.value = false;
  }
};

const changePage = async (
  nextPageIndex: number,
  nextCursors: Array<Cursor | undefined>,
) => {
  if (!projectId) return;
  const requestVersion = listRequestVersion.value + 1;
  listRequestVersion.value = requestVersion;
  pageIndex.value = nextPageIndex;
  cursors.value = nextCursors;
  loading.value = true;
  listError.value = undefined;
  try {
    const cursor = nextCursors[nextPageIndex];
    const result = await orpc.task.list({
      projectId,
      pageSize: 20,
      ...(cursor === undefined ? {} : { cursor }),
      ...(status.value === undefined ? {} : { status: status.value }),
      ...(kind.value === undefined ? {} : { kind: kind.value }),
    });
    if (requestVersion === listRequestVersion.value) {
      tasks.value = result;
      commitList();
    }
  } catch {
    if (requestVersion === listRequestVersion.value) {
      restoreCommittedList();
      listError.value = t("任务列表暂时无法加载，请重试");
    }
  } finally {
    if (requestVersion === listRequestVersion.value) loading.value = false;
  }
};

const previous = async () => {
  await changePage(pageIndex.value - 1, cursors.value);
};

const next = async () => {
  if (!tasks.value.nextCursor) return;
  const nextCursors = [...cursors.value];
  nextCursors[pageIndex.value + 1] = tasks.value.nextCursor;
  await changePage(pageIndex.value + 1, nextCursors);
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

const taskStatusLabels: Record<TaskStatus, string> = {
  PENDING: "等待中",
  RUNNING: "运行中",
  BLOCKED: "已阻塞",
  CANCEL_REQUESTED: "取消请求中",
  COMPLETED: "已完成",
  FAILED: "失败",
  CANCELED: "已取消",
};
const phaseLabels: Record<
  BatchAutoTranslationTaskPhase | RecallDerivationTaskPhase,
  string
> = {
  PREPARING: "准备中",
  TRANSLATING: "翻译中",
  INDEXING: "索引中",
  QUEUED: "等待派生",
  DERIVING: "派生中",
  PUBLISHING: "发布中",
};
const actorLabels: Record<TaskActor["type"], string> = {
  USER: "用户",
  SYSTEM: "系统",
};
const resourceLabels: Record<TaskAffectedResource["type"], string> = {
  PROJECT: "项目",
  ELEMENT: "元素",
  TRANSLATION: "翻译",
  MEMORY: "记忆库",
  GLOSSARY: "术语库",
};
const sortModeLabels: Record<ElementSortMode, string> = {
  structure: "结构顺序",
  "reuse-first": "复用优先",
};
const failureCodeLabels: Record<OperationFailureCode, string> = {
  CAT_OPERATION_CANCELED: "操作已取消",
  CAT_OPERATION_DEPENDENCY_UNAVAILABLE: "依赖不可用",
  CAT_OPERATION_EXECUTION_DENIED: "操作执行被拒绝",
  CAT_OPERATION_INVALID_INPUT: "输入无效",
  CAT_OPERATION_MISSING_CAPABILITY: "缺少所需能力",
  CAT_OPERATION_RESOURCE_NOT_FOUND: "资源不可用",
  CAT_OPERATION_FAILED: "操作失败",
  CAT_OPERATION_PERMISSION_DENIED: "权限不足",
  CAT_OPERATION_RELATIONSHIP_DENIED: "关系授权被拒绝",
  CAT_OPERATION_REVIEW_CHANGE_BLOCKED: "审校变更被阻止",
};
const severityLabels: Record<OperationFailureSeverity, string> = {
  INFO: "信息",
  WARNING: "警告",
  ERROR: "错误",
};
const blockerLabels: Record<OperationFailureBlocker, string> = {
  branch_translation_write_failed: "分支译文写入失败",
  branch_write_context_unavailable: "分支写入上下文不可用",
  candidate_channel_capability_unavailable: "候选通道能力不可用",
  candidate_channel_execution_failed: "候选通道执行失败",
  language_analysis_duplicate_implementation: "语言分析实现重复",
  language_analysis_installation_scope_mismatch: "语言分析安装范围不匹配",
  language_analysis_invalid_attestation: "语言分析证明无效",
  language_analysis_invalid_configuration: "语言分析配置无效",
  language_analysis_invalid_response: "语言分析响应无效",
  language_analysis_missing_implementation: "缺少语言分析实现",
  language_analysis_missing_selection: "缺少语言分析选择",
  language_analysis_policy_changed: "语言分析策略已变更",
  language_analysis_service_type_mismatch: "语言分析服务类型不匹配",
  language_analysis_timeout: "语言分析超时",
  language_analysis_unavailable: "语言分析不可用",
  language_analysis_unsupported_language: "语言分析不支持该语言",
  recall_derivation_blocked: "召回派生已阻塞",
  recall_derivation_failed: "召回派生失败",
  recall_derivation_pending: "召回派生等待中",
  recall_derivation_stale: "召回派生已过期",
  reviewable_change_write_failed: "可审校变更写入失败",
};
const capabilityLabels: Record<OperationFailureCapability, string> = {
  CANDIDATE_RECALL: "候选召回",
  LANGUAGE_ANALYSIS: "语言分析",
  RECALL_DERIVATION: "召回派生",
  VECTOR_STORAGE: "向量存储",
  TEXT_VECTORIZER: "文本向量化",
};
const authorizationDecisionLabels: Record<
  OperationFailureAuthorizationDecision,
  string
> = {
  api_key_scope_denied: "API 密钥范围被拒绝",
  rebac_denied: "关系授权被拒绝",
  write_mode_denied: "写入模式被拒绝",
};
const localizedEnum = <Value extends string>(
  value: Value,
  labels: Record<Value, string>,
  unknownKey: string,
): string => {
  const label = labels[value];
  return label === undefined ? t(unknownKey) : t(label);
};
const taskStatusLabel = (value: TaskStatus): string =>
  localizedEnum(value, taskStatusLabels, "未知任务状态");
const phaseLabel = (
  value: BatchAutoTranslationTaskPhase | RecallDerivationTaskPhase,
): string => localizedEnum(value, phaseLabels, "未知任务阶段");
const actorLabel = (value: TaskActor["type"]): string =>
  localizedEnum(value, actorLabels, "未知执行者");
const resourceLabel = (value: TaskAffectedResource["type"]): string =>
  localizedEnum(value, resourceLabels, "未知资源类型");
const sortModeLabel = (value: ElementSortMode): string =>
  localizedEnum(value, sortModeLabels, "未知排序方式");
const failureCodeLabel = (value: OperationFailureCode | undefined): string =>
  value === undefined
    ? t("未知失败代码")
    : localizedEnum(value, failureCodeLabels, "未知失败代码");
const severityLabel = (value: OperationFailureSeverity | undefined): string =>
  value === undefined
    ? t("未知失败级别")
    : localizedEnum(value, severityLabels, "未知失败级别");
const blockerLabel = (value: OperationFailureBlocker): string =>
  localizedEnum(value, blockerLabels, "未知阻塞原因");
const capabilityLabel = (value: OperationFailureCapability): string =>
  localizedEnum(value, capabilityLabels, "未知能力");
const authorizationDecisionLabel = (
  value: OperationFailureAuthorizationDecision,
): string => localizedEnum(value, authorizationDecisionLabels, "未知授权决定");
</script>

<template>
  <ProjectPageDataError v-if="pageError" :message="pageError.message" />
  <section v-else class="space-y-4 p-4">
    <TaskTable
      :data="tasks.items"
      :has-previous="pageIndex > 0"
      :has-more="tasks.hasMore"
      :loading="loading"
      :error="listError"
      :status="status"
      :kind="kind"
      :action-task-id="actionTaskId"
      :action-busy="actionBusy"
      :action-error="actionError"
      @refresh="load"
      @update:status="changeStatus"
      @update:kind="changeKind"
      @previous="previous"
      @next="next"
      @detail="openDetail"
      @cancel="cancel"
      @retry="retry"
      @resume="resume"
    />
    <section
      v-if="detailAvailability"
      class="border-t pt-4 text-sm"
      role="status"
      aria-live="polite"
      :aria-busy="detailAvailability === 'loading'"
    >
      <h2 class="font-semibold">
        {{
          detailAvailability === "loading"
            ? $t("任务详情")
            : $t("任务详情不可用")
        }}
      </h2>
      <p class="mt-1 text-muted-foreground">
        {{
          detailAvailability === "loading"
            ? $t("正在加载任务详情")
            : detailAvailability === "invalid"
              ? $t("任务链接无效，请从任务列表重新打开详情")
              : $t("请求的任务当前不可用")
        }}
      </p>
      <button
        v-if="detailAvailability === 'unavailable'"
        class="mt-2 underline"
        type="button"
        @click="retryDetail"
      >
        {{ $t("重新加载详情") }}
      </button>
    </section>
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
        <dd>{{ taskStatusLabel(selectedDetail.task.state.status) }}</dd>
        <dt class="text-muted-foreground">{{ $t("阶段") }}</dt>
        <dd>
          {{
            selectedDetail.task.state.runtime.phase
              ? phaseLabel(selectedDetail.task.state.runtime.phase)
              : $t("无")
          }}
        </dd>
        <dt class="text-muted-foreground">{{ $t("进度") }}</dt>
        <dd>
          <template
            v-if="
              selectedDetail.task.state.progressCurrent === null &&
              selectedDetail.task.state.progressTotal === null
            "
          >
            {{ $t("无") }}
          </template>
          <template v-else>
            {{ selectedDetail.task.state.progressCurrent ?? $t("未确定") }} /
            {{ selectedDetail.task.state.progressTotal ?? $t("未确定") }}
          </template>
        </dd>
        <dt class="text-muted-foreground">{{ $t("执行者") }}</dt>
        <dd class="break-all">
          {{ actorLabel(selectedDetail.task.state.actor.type) }} ·
          {{ selectedDetail.task.state.actor.id ?? $t("系统") }}
        </dd>
        <template
          v-if="selectedDetail.task.task.kind === 'BATCH_AUTO_TRANSLATION'"
        >
          <dt class="text-muted-foreground">{{ $t("语言") }}</dt>
          <dd>{{ selectedDetail.task.task.payload.invocation.languageId }}</dd>
          <dt class="text-muted-foreground">{{ $t("排序") }}</dt>
          <dd>
            {{
              sortModeLabel(
                selectedDetail.task.task.payload.invocation.sortMode,
              )
            }}
          </dd>
        </template>
        <template v-else>
          <dt class="text-muted-foreground">{{ $t("派生需求") }}</dt>
          <dd>{{ selectedDetail.task.task.payload.references.length }}</dd>
        </template>
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
        <section
          v-if="selectedDetail.task.task.kind === 'BATCH_AUTO_TRANSLATION'"
        >
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
              {{
                $t("{type} · {id}", {
                  type: resourceLabel(resource.type),
                  id: resource.id,
                })
              }}
            </li>
          </ul>
        </section>
        <section>
          <h3 class="mb-2 font-medium">{{ $t("结果") }}</h3>
          <template
            v-if="
              selectedDetail.task.state.runtime.result &&
              selectedDetail.task.state.runtime.kind ===
                'BATCH_AUTO_TRANSLATION'
            "
          >
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
          <template
            v-else-if="
              selectedDetail.task.state.runtime.result &&
              selectedDetail.task.state.runtime.kind === 'RECALL_DERIVATION'
            "
          >
            <p>
              {{ $t("新鲜") }}:
              {{ selectedDetail.task.state.runtime.result.fresh }}
            </p>
            <p>
              {{ $t("失败") }}:
              {{ selectedDetail.task.state.runtime.result.failed }}
            </p>
            <p>
              {{ $t("已被替代") }}:
              {{ selectedDetail.task.state.runtime.result.superseded }}
            </p>
          </template>
          <p v-else class="text-muted-foreground">{{ $t("无") }}</p>
        </section>
        <section>
          <h3 class="mb-2 font-medium">{{ $t("当前失败") }}</h3>
          <template v-if="selectedDetail.currentFailure">
            <p class="font-medium">
              {{ failureCodeLabel(selectedDetail.currentFailure.code) }}
            </p>
            <p>{{ selectedDetail.currentFailure.message }}</p>
            <p class="mt-2 text-muted-foreground">
              {{ severityLabel(selectedDetail.currentFailure.severity) }} ·
              {{
                selectedDetail.currentFailure.retryable
                  ? $t("可重试")
                  : $t("不可重试")
              }}
            </p>
            <p v-if="selectedDetail.currentFailure.blocker">
              {{ blockerLabel(selectedDetail.currentFailure.blocker) }}
            </p>
            <p v-if="selectedDetail.currentFailure.capability">
              {{ capabilityLabel(selectedDetail.currentFailure.capability) }}
            </p>
            <p v-if="selectedDetail.currentFailure.authorizationDecision">
              {{
                authorizationDecisionLabel(
                  selectedDetail.currentFailure.authorizationDecision,
                )
              }}
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
