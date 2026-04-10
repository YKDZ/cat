<script setup lang="ts">
import { ScrollArea, Textarea, Button } from "@cat/ui";
import {
  ArrowRight,
  Plus,
  Square,
  RotateCcw,
  AlertTriangle,
  Pause,
  Play,
} from "@lucide/vue";
import { storeToRefs } from "pinia";
import { ref, nextTick, watch, onMounted, onUnmounted, computed } from "vue";
import { useI18n } from "vue-i18n";

import { useAgentStore } from "@/app/stores/agent";
import { useRegisterClientTools } from "@/app/utils/agent/register-client-tools";

import AgentMaxStepsCard from "./AgentMaxStepsCard.vue";
import AgentMessageBubble from "./AgentMessageBubble.vue";
import AgentSelector from "./AgentSelector.vue";
import AgentThinkingIndicator from "./AgentThinkingIndicator.vue";
import AgentToolConfirmCard from "./AgentToolConfirmCard.vue";

const props = defineProps<{
  /** @zh 当前项目外部 UUID @en Current project external UUID */
  projectId: string;
}>();

const { t } = useI18n();
const agentStore = useAgentStore();
const {
  messages,
  streamingText,
  thinkingText,
  streamingStatus,
  isStreaming,
  runId,
  activeSessionId,
  selectedDefinitionId,
  selectedDefinition,
  currentSteps,
  errorMessage,
  pendingConfirmation,
  maxStepsReached,
  lastFinishReason,
} = storeToRefs(agentStore);

// Register client-side tool handlers for the agent
useRegisterClientTools();

const inputText = ref("");
const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null);
const composerTextareaRef = ref<InstanceType<typeof Textarea> | null>(null);

/** 跟踪用户是否处于底部(阈値 80px)，手动向上滚动后不再自动跟随 */
const isAtBottom = ref(true);
const SCROLL_THRESHOLD = 80;
const COMPOSER_MAX_HEIGHT = 160;

const getViewport = (): Element | null =>
  scrollAreaRef.value?.$el?.querySelector("[data-reka-scroll-area-viewport]") ??
  null;

const handleScroll = () => {
  const el = getViewport();
  if (!el) return;
  isAtBottom.value =
    el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD;
};

const scrollToBottom = () => {
  if (!isAtBottom.value) return;
  nextTick(() => {
    const viewport = getViewport();
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  });
};

const getComposerTextarea = (): HTMLTextAreaElement | null => {
  const element = composerTextareaRef.value?.$el;
  return element instanceof HTMLTextAreaElement ? element : null;
};

const resizeComposer = () => {
  nextTick(() => {
    const textarea = getComposerTextarea();
    if (!textarea) return;

    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, COMPOSER_MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > COMPOSER_MAX_HEIGHT ? "auto" : "hidden";
  });
};

onMounted(() => {
  nextTick(() => {
    getViewport()?.addEventListener("scroll", handleScroll, { passive: true });
    resizeComposer();
  });
});

onUnmounted(() => {
  getViewport()?.removeEventListener("scroll", handleScroll);
});

watch(
  [messages, streamingText, thinkingText, pendingConfirmation, maxStepsReached],
  () => {
    scrollToBottom();
  },
);

watch(inputText, () => {
  resizeComposer();
});

const handleSend = async () => {
  const text = inputText.value.trim();
  if (!text) return;
  if (isStreaming.value) return;

  // 发送消息时强制重置到底部，确保新回复可见
  isAtBottom.value = true;

  // Auto-create session if none active
  if (!activeSessionId.value && selectedDefinitionId.value) {
    const sessionId = await agentStore.createSession(
      selectedDefinitionId.value,
      {
        projectId: props.projectId,
      },
    );
    if (!sessionId) return;
  }

  inputText.value = "";
  resizeComposer();
  await agentStore.sendMessage(text);
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void handleSend();
  }
};

const handleNewSession = () => {
  agentStore.selectDefinition(selectedDefinitionId.value);
};

const isRunActive = computed(() => {
  return (
    streamingStatus.value === "streaming" ||
    streamingStatus.value === "paused" ||
    streamingStatus.value === "waiting_input"
  );
});

const showThinkingIndicator = computed(() => {
  return (
    ((streamingStatus.value === "streaming" ||
      streamingStatus.value === "waiting_input") &&
      (thinkingText.value.length > 0 ||
        currentSteps.value.length > 0 ||
        streamingText.value.length === 0)) ||
    (streamingStatus.value === "paused" &&
      (thinkingText.value.length > 0 || currentSteps.value.length > 0))
  );
});

const handleRetry = () => {
  void agentStore.retryLastMessage();
};

const handleCancel = () => {
  void agentStore.cancelStreaming();
};

onMounted(() => {
  void agentStore.fetchDefinitions({ type: "GENERAL" });
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- Agent Selector (when no session is active) -->
    <div v-if="!activeSessionId" class="border-b p-2">
      <AgentSelector />
    </div>

    <!-- Active session header with new-session button -->
    <div
      v-if="activeSessionId"
      class="flex items-center justify-between border-b px-3 py-1.5"
    >
      <span class="truncate text-xs text-muted-foreground">
        {{ selectedDefinition?.name ?? t("对话中") }}
      </span>
      <Button
        size="icon-sm"
        variant="ghost"
        :title="t('新建会话')"
        :disabled="isRunActive"
        @click="handleNewSession"
      >
        <Plus class="size-3.5" />
      </Button>
    </div>

    <!-- Chat Messages -->
    <div class="min-h-0 flex-1 overflow-hidden">
      <ScrollArea ref="scrollAreaRef" class="h-full w-full">
        <div class="flex flex-col gap-2 p-2">
          <!-- Empty state -->
          <div
            v-if="messages.length === 0 && !isStreaming"
            class="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground"
          >
            <p>{{ t("选择一个 Agent 并发送消息开始对话") }}</p>
          </div>

          <!-- Messages -->
          <AgentMessageBubble
            v-for="(msg, idx) in messages"
            :key="idx"
            :role="msg.role"
            :content="msg.content"
            :toolCallId="msg.toolCallId"
            :steps="msg.steps"
            :stepIndex="msg.stepIndex"
            :thinkingText="msg.thinkingText"
          />

          <!-- Thinking indicator (shown during the entire streaming ReAct loop).
               Only thinkingText + steps are rendered here; the live response
               text (streamingText) is rendered separately in a streaming
               MessageBubble below so the final response streams directly in
               the message area, matching the UX of ChatGPT / Copilot. -->
          <AgentThinkingIndicator
            v-if="showThinkingIndicator"
            :thinkingText="thinkingText"
            :steps="currentSteps"
            :paused="streamingStatus === 'paused'"
          />

          <!-- Streaming response bubble — shows the live text_delta output. -->
          <AgentMessageBubble
            v-if="isRunActive && streamingText"
            role="ASSISTANT"
            :content="streamingText"
            :isStreaming="true"
          />

          <!-- Inline tool confirmation card (appears in message flow) -->
          <AgentToolConfirmCard
            v-if="pendingConfirmation"
            :confirmation="pendingConfirmation"
          />

          <!-- Max steps reached card -->
          <AgentMaxStepsCard v-if="maxStepsReached" :info="maxStepsReached" />

          <!-- Implicit completion warning -->
          <div
            v-if="
              lastFinishReason === 'implicit_completion' &&
              streamingStatus === 'done'
            "
            class="flex items-center gap-1.5 rounded-md border border-yellow-500/50 bg-yellow-50/10 p-2 text-xs text-yellow-600 dark:text-yellow-400"
          >
            <AlertTriangle class="size-3.5 shrink-0" />
            {{ t("Agent 未通过标准方式结束任务，以上回复可能不完整。") }}
          </div>
        </div>
      </ScrollArea>
    </div>

    <!-- Input Area -->
    <div class="border-t p-3">
      <div
        class="rounded-2xl border border-border/70 bg-background p-2 shadow-sm"
      >
        <Textarea
          ref="composerTextareaRef"
          v-model="inputText"
          rows="1"
          :placeholder="t('输入消息...')"
          :disabled="!selectedDefinitionId && !activeSessionId"
          class="min-h-0! resize-none border-0 bg-transparent px-2 py-1 text-sm leading-6 shadow-none focus-visible:ring-0"
          @keydown="handleKeydown"
        />

        <div class="mt-2 flex items-center justify-between gap-2 px-1">
          <div class="min-h-5" />

          <div class="flex items-center gap-1">
            <Button
              v-if="runId && streamingStatus === 'streaming'"
              size="icon-sm"
              variant="outline"
              :title="t('暂停')"
              @click="agentStore.pauseGraphRun"
            >
              <Pause class="size-4" />
            </Button>

            <Button
              v-if="runId && streamingStatus === 'paused'"
              size="icon-sm"
              variant="outline"
              :title="t('恢复')"
              @click="agentStore.resumeGraphRun"
            >
              <Play class="size-4" />
            </Button>

            <Button
              v-if="isRunActive"
              size="icon-sm"
              variant="destructive"
              :title="t('取消运行')"
              @click="handleCancel"
            >
              <Square class="size-4" />
            </Button>

            <Button
              v-else
              size="icon-sm"
              :disabled="
                !inputText.trim() || (!selectedDefinitionId && !activeSessionId)
              "
              :title="t('发送')"
              @click="handleSend"
            >
              <ArrowRight class="size-4" />
            </Button>
          </div>
        </div>

        <div
          v-if="streamingStatus === 'error' && errorMessage"
          class="mt-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive"
        >
          <p>{{ errorMessage }}</p>
          <Button
            size="sm"
            variant="ghost"
            class="mt-1.5 text-xs text-destructive hover:text-destructive"
            @click="handleRetry"
          >
            <RotateCcw class="mr-1 size-3" />
            {{ t("重试") }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
