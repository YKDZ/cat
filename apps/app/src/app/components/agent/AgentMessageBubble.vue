<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronDown, ChevronRight } from "lucide-vue-next";
import Markdown from "@/app/components/Markdown.vue";
import AgentToolCallCard from "./AgentToolCallCard.vue";
import type { AgentStepItem } from "@/app/stores/agent";

const props = withDefaults(
  defineProps<{
    role: string;
    content: string | null;
    toolCallId?: string | null;
    steps?: AgentStepItem[];
    stepIndex?: number | null;
    thinkingText?: string | null;
    isStreaming?: boolean;
  }>(),
  {
    isStreaming: false,
  },
);

const { t } = useI18n();

const isUser = computed(() => props.role === "USER");
const isAssistant = computed(() => props.role === "ASSISTANT");
const isSystem = computed(() => props.role === "SYSTEM");
const isTool = computed(() => props.role === "TOOL");

const timelineExpanded = ref(false);

/**
 * 只保留有实质工具调用或有 thinkingText 的步骤进入时间线。
 *
 * 说明：finish_task 这类控制型工具在 store 层已被过滤，不会出现在 step.toolCalls 中。
 * 因此"仅调用 finish_task"的步骤 toolCalls.length === 0，不进入时间线，避免空白条目。
 */
const timelineSteps = computed(() => {
  if (!props.steps || props.steps.length === 0) return [];
  return props.steps.filter(
    (step) => step.toolCalls.length > 0 || !!step.thinkingText,
  );
});

/** 有时间线步骤时显示折叠区 */
const hasTimeline = computed(() => timelineSteps.value.length > 0);

const displayContent = computed(() => {
  if (props.content) return props.content;
  if (isTool.value && props.toolCallId) return t("工具调用结果");
  return "";
});
</script>

<template>
  <!-- System / Tool messages hidden from chat UI -->
  <template v-if="!isSystem && !isTool">
    <!-- 用户消息：右对齐气泡 -->
    <div v-if="isUser" class="flex flex-col items-end gap-0.5">
      <span class="text-[10px] font-medium text-muted-foreground">{{
        t("你")
      }}</span>
      <div
        class="max-w-[80%] rounded-xl bg-primary px-3 py-1.5 text-primary-foreground shadow-sm"
      >
        <p class="text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
          {{ displayContent }}
        </p>
      </div>
    </div>

    <!-- Agent 回复：思考+工具调用时间线 + 最终回复 -->
    <div v-else-if="isAssistant" class="flex flex-col gap-1">
      <!-- 时间线折叠按钮 -->
      <button
        v-if="hasTimeline"
        class="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        @click="timelineExpanded = !timelineExpanded"
      >
        <component
          :is="timelineExpanded ? ChevronDown : ChevronRight"
          class="size-3"
        />
        <span>{{ t("思路") }}</span>
      </button>
      <div v-if="hasTimeline && timelineExpanded">
        <div
          class="max-h-56 overflow-x-hidden overflow-y-auto rounded border border-border/50 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground [&::-webkit-scrollbar]:size-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent"
        >
          <!-- 各步骤：扩展思考 + thought + 工具调用（按执行顺序交错显示） -->
          <ol class="space-y-2">
            <li v-for="(step, idx) in timelineSteps" :key="idx">
              <!-- 该步骤的 Claude extended thinking -->
              <div
                v-if="step.thinkingText"
                class="mb-1 border-b border-border/30 pb-1"
              >
                <Markdown :content="step.thinkingText" />
              </div>
              <!-- 该步骤的 thought -->
              <div
                v-if="step.thought && step.toolCalls.length > 0"
                class="mb-1"
              >
                <Markdown :content="step.thought" />
              </div>
              <!-- 该步骤的工具调用卡片 -->
              <div v-if="step.toolCalls.length > 0" class="flex flex-col gap-1">
                <AgentToolCallCard
                  v-for="tc in step.toolCalls"
                  :key="tc.id"
                  :toolCall="tc"
                />
              </div>
            </li>
          </ol>
        </div>
      </div>

      <!-- 最终回复内容 -->
      <div v-if="displayContent" class="text-sm leading-relaxed">
        <Markdown :content="displayContent" class="wrap-break-word" />
        <span
          v-if="isStreaming"
          class="ml-0.5 inline-block h-4 w-1 animate-pulse bg-current"
        />
      </div>
    </div>
  </template>
</template>
