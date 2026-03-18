<script setup lang="ts">
import { Spinner } from "@cat/ui";
import { ChevronDown, ChevronRight, Pause } from "lucide-vue-next";
import { ref, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";

import type { AgentStepItem } from "@/app/stores/agent";

import Markdown from "@/app/components/Markdown.vue";

import AgentToolCallCard from "./AgentToolCallCard.vue";

const props = defineProps<{
  /** Progressive thinking/reasoning text from the model */
  thinkingText?: string;
  /** Steps accumulated during streaming (shows tool calls in progress) */
  steps?: AgentStepItem[];
  /** Whether the run is currently paused */
  paused?: boolean;
}>();


const { t } = useI18n();
const isExpanded = ref(true);
const scrollEl = ref<HTMLDivElement | null>(null);


/** 跟踪用户是否处于底部（阈値 60px），不在底部时不强制滚动 */
const isAtBottom = ref(true);
const SCROLL_THRESHOLD = 60;


const handleScroll = () => {
  const el = scrollEl.value;
  if (!el) return;
  isAtBottom.value =
    el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD;
};


const scrollToBottom = () => {
  if (!isAtBottom.value) return;
  nextTick(() => {
    if (scrollEl.value) {
      scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
    }
  });
};


watch(() => [props.thinkingText, props.steps?.length], scrollToBottom);
</script>

<template>
  <div class="flex flex-col gap-1 py-1">
    <!-- Header with spinner and toggle -->
    <button class="flex items-center gap-2" @click="isExpanded = !isExpanded">
      <Pause v-if="paused" class="size-3.5 text-muted-foreground" />
      <Spinner v-else class="size-3.5 text-muted-foreground" />
      <span class="text-xs text-muted-foreground">{{
        paused ? t("已暂停") : t("正在思考...")
      }}</span>
      <component
        :is="isExpanded ? ChevronDown : ChevronRight"
        v-if="thinkingText || (steps && steps.length > 0)"
        class="size-3 text-muted-foreground"
      />
    </button>

    <!-- Thinking + in-progress tool calls (collapsible) -->
    <div
      v-if="isExpanded && (thinkingText || (steps && steps.length > 0))"
      class="ml-5.5"
    >
      <div
        ref="scrollEl"
        class="max-h-48 overflow-x-hidden overflow-y-auto rounded border border-border/50 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground [&::-webkit-scrollbar]:size-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent"
        @scroll="handleScroll"
      >
        <!-- 已完成各步骤（按时间顺序在前）：thinkingText + thought + toolCalls -->
        <div v-if="steps && steps.length > 0" class="flex flex-col gap-2">
          <template v-for="(step, idx) in steps" :key="idx">
            <div
              v-if="step.thinkingText"
              class="border-b border-border/30 pb-1"
            >
              <Markdown :content="step.thinkingText" />
            </div>
            <div v-if="step.thought" class="mb-1">
              <Markdown :content="step.thought" />
            </div>
            <div v-if="step.toolCalls.length > 0" class="flex flex-col gap-1">
              <AgentToolCallCard
                v-for="tc in step.toolCalls"
                :key="tc.id"
                :toolCall="tc"
              />
            </div>
          </template>
        </div>

        <!-- 当前步骤 live 流式思考（在末尾，时间上最新） -->
        <div
          v-if="thinkingText"
          :class="
            steps && steps.length > 0
              ? 'mt-2 border-t border-border/30 pt-2'
              : ''
          "
        >
          <Markdown :content="thinkingText" />
        </div>
      </div>
    </div>
  </div>
</template>
