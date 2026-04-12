<script setup lang="ts">
import { Button, ScrollArea, Textarea } from "@cat/ui";
import {
  AlertTriangle,
  ArrowRight,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
} from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/app/rpc/orpc";
import { useAgentStore } from "@/app/stores/agent";
import { useRegisterClientTools } from "@/app/utils/agent/register-client-tools";
import { clientLogger as logger } from "@/app/utils/logger";

import AgentMaxStepsCard from "./AgentMaxStepsCard.vue";
import AgentMessageBubble from "./AgentMessageBubble.vue";
import AgentProviderSelector from "./AgentProviderSelector.vue";
import AgentSelector from "./AgentSelector.vue";
import AgentThinkingIndicator from "./AgentThinkingIndicator.vue";
import AgentToolConfirmCard from "./AgentToolConfirmCard.vue";

const props = defineProps<{
  /** @zh 当前项目外部 UUID @en Current project external UUID */
  projectId: string;
  /** @zh 当前项目名称 @en Current project name */
  projectName: string;
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
  activeSessionContext,
  selectedDefinitionId,
  selectedDefinition,
  currentSteps,
  errorMessage,
  pendingConfirmation,
  maxStepsReached,
  lastFinishReason,
} = storeToRefs(agentStore);

interface LLMProviderOption {
  id: number;
  serviceId: string;
  name: string;
}

useRegisterClientTools();

const inputText = ref("");
const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null);
const composerTextareaRef = ref<InstanceType<typeof Textarea> | null>(null);
const llmProviders = ref<LLMProviderOption[]>([]);
const selectedProviderId = ref<number | null>(null);
const isAtBottom = ref(true);
const resizeObserver = ref<ResizeObserver | null>(null);
const scrollViewport = ref<HTMLElement | null>(null);
const viewportContentHeight = ref(0);

const SCROLL_THRESHOLD = 80;

const composerMaxHeight = computed(() => {
  return activeSessionId.value ? 160 : 240;
});

const renderSignal = computed(() =>
  [
    messages.value.length,
    messages.value.at(-1)?.content ?? "",
    streamingText.value,
    currentSteps.value.length,
    thinkingText.value,
    pendingConfirmation.value?.callId ?? "",
    maxStepsReached.value?.totalSteps ?? 0,
    streamingStatus.value,
  ].join("|"),
);

const getViewport = (): HTMLElement | null => {
  const element =
    scrollAreaRef.value?.$el?.querySelector(
      "[data-reka-scroll-area-viewport]",
    ) ?? null;
  return element instanceof HTMLElement ? element : null;
};

const handleScroll = () => {
  const el = scrollViewport.value ?? getViewport();
  if (!el) return;
  isAtBottom.value =
    el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD;
};

const scrollToBottom = (force = false) => {
  if (!force && !isAtBottom.value) return;
  nextTick(() => {
    const viewport = scrollViewport.value ?? getViewport();
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
      if (force) {
        isAtBottom.value = true;
      }
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
    const nextHeight = Math.min(textarea.scrollHeight, composerMaxHeight.value);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > composerMaxHeight.value ? "auto" : "hidden";
  });
};

const syncViewportBindings = () => {
  const viewport = getViewport();

  if (scrollViewport.value !== viewport) {
    scrollViewport.value?.removeEventListener("scroll", handleScroll);
    scrollViewport.value = viewport;
    scrollViewport.value?.addEventListener("scroll", handleScroll, {
      passive: true,
    });
  }

  resizeObserver.value?.disconnect();
  const content = viewport?.firstElementChild;
  if (content instanceof HTMLElement && resizeObserver.value) {
    viewportContentHeight.value = content.offsetHeight;
    resizeObserver.value.observe(content);
  }

  handleScroll();
};

const fetchLLMProviders = async () => {
  try {
    llmProviders.value = await orpc.agent.listLLMProviders();
    if (selectedProviderId.value === null) {
      selectedProviderId.value = llmProviders.value[0]?.id ?? null;
    }
  } catch (err) {
    logger.withSituation("WEB").error(err, "Failed to fetch LLM providers");
  }
};

watch(inputText, () => {
  resizeComposer();
});

watch(
  renderSignal,
  () => {
    syncViewportBindings();
    scrollToBottom();
  },
  { flush: "post" },
);

watch(
  () => scrollAreaRef.value,
  () => {
    void nextTick(() => {
      syncViewportBindings();
    });
  },
  { flush: "post" },
);

watch(
  activeSessionId,
  () => {
    isAtBottom.value = true;
    void nextTick(() => {
      syncViewportBindings();
      scrollToBottom(true);
    });
  },
  { flush: "post" },
);

watch(
  [activeSessionId, activeSessionContext, llmProviders],
  () => {
    if (
      activeSessionId.value &&
      typeof activeSessionContext.value?.providerId === "number"
    ) {
      selectedProviderId.value = activeSessionContext.value.providerId;
      return;
    }

    if (selectedProviderId.value === null) {
      selectedProviderId.value = llmProviders.value[0]?.id ?? null;
    }
  },
  { immediate: true },
);

const handleSend = async () => {
  const text = inputText.value.trim();
  if (!text) return;
  if (isStreaming.value) return;

  isAtBottom.value = true;

  if (!activeSessionId.value && selectedDefinitionId.value) {
    const sessionId = await agentStore.createSession(
      selectedDefinitionId.value,
      {
        projectId: props.projectId,
        projectName: props.projectName,
        providerId: selectedProviderId.value ?? undefined,
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
  isAtBottom.value = true;
  agentStore.selectDefinition(selectedDefinitionId.value);
};

const handleProviderChange = (value: number | null) => {
  selectedProviderId.value = value;
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

const composerWrapperClass = computed(() => {
  return activeSessionId.value
    ? "shrink-0 border-t bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    : "px-5 pb-5 pt-3";
});

const composerCardClass = computed(() => {
  return activeSessionId.value
    ? "rounded-2xl border border-border/70 bg-background p-2 shadow-sm"
    : "rounded-3xl border border-border/70 bg-background p-3 shadow-sm";
});

const composerTextareaClass = computed(() => {
  return activeSessionId.value
    ? "min-h-[72px] resize-none border-0 bg-transparent px-2 py-1 text-sm leading-6 shadow-none focus-visible:ring-0"
    : "min-h-[144px] resize-none border-0 bg-transparent px-2 py-1 text-sm leading-6 shadow-none focus-visible:ring-0";
});

onMounted(() => {
  resizeObserver.value = new ResizeObserver((entries) => {
    const entry = entries[0];
    const nextHeight =
      entry?.target instanceof HTMLElement
        ? entry.target.offsetHeight
        : viewportContentHeight.value;
    const previousHeight = viewportContentHeight.value;
    viewportContentHeight.value = nextHeight;

    if (nextHeight > previousHeight && isAtBottom.value) {
      scrollToBottom();
    }
  });

  void agentStore.fetchDefinitions({
    type: "GENERAL",
    scopeType: "PROJECT",
    scopeId: props.projectId,
  });
  void fetchLLMProviders();

  nextTick(() => {
    syncViewportBindings();
    resizeComposer();
  });
});

onUnmounted(() => {
  scrollViewport.value?.removeEventListener("scroll", handleScroll);
  resizeObserver.value?.disconnect();
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div v-if="!activeSessionId" class="shrink-0 border-b px-5 py-4">
      <h1 class="text-2xl font-semibold">{{ t("Agents") }}</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ t("选择 Agent 与模型后开始对话") }}
      </p>
    </div>

    <div
      v-if="activeSessionId"
      class="flex shrink-0 items-center justify-between border-b px-4 py-3"
    >
      <div class="min-w-0">
        <div class="truncate text-sm font-medium">
          {{ selectedDefinition?.name ?? t("对话中") }}
        </div>
        <div class="truncate text-xs text-muted-foreground">
          {{ t("继续当前会话") }}
        </div>
      </div>
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

    <div v-if="!activeSessionId" :class="composerWrapperClass">
      <div :class="composerCardClass">
        <Textarea
          ref="composerTextareaRef"
          v-model="inputText"
          rows="3"
          :placeholder="t('输入消息...')"
          :disabled="!selectedDefinitionId && !activeSessionId"
          :class="composerTextareaClass"
          @keydown="handleKeydown"
        />

        <div class="mt-2 flex items-center justify-between gap-2 px-1">
          <div class="flex min-h-5 flex-wrap items-center gap-1">
            <AgentSelector compact :disabled="isRunActive" />
            <AgentProviderSelector
              compact
              :providers="llmProviders"
              :model-value="selectedProviderId"
              :disabled="isRunActive || llmProviders.length === 0"
              @update:model-value="handleProviderChange"
            />
          </div>

          <div class="flex items-center gap-1">
            <Button
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

    <div class="min-h-0 flex-1 overflow-hidden">
      <ScrollArea ref="scrollAreaRef" class="h-full w-full">
        <div
          class="flex min-h-full flex-col gap-2"
          :class="activeSessionId ? 'p-3' : 'px-5 pb-5'"
        >
          <div
            v-if="messages.length === 0 && !isStreaming"
            class="flex min-h-full flex-1 flex-col items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground"
          >
            <p>{{ t("选择一个 Agent 并发送消息开始对话") }}</p>
          </div>

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

          <AgentThinkingIndicator
            v-if="showThinkingIndicator"
            :thinkingText="thinkingText"
            :steps="currentSteps"
            :paused="streamingStatus === 'paused'"
          />

          <AgentMessageBubble
            v-if="isRunActive && streamingText"
            role="ASSISTANT"
            :content="streamingText"
            :isStreaming="true"
          />

          <AgentToolConfirmCard
            v-if="pendingConfirmation"
            :confirmation="pendingConfirmation"
          />

          <AgentMaxStepsCard v-if="maxStepsReached" :info="maxStepsReached" />

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

    <div v-if="activeSessionId" :class="composerWrapperClass">
      <div :class="composerCardClass">
        <Textarea
          ref="composerTextareaRef"
          v-model="inputText"
          rows="1"
          :placeholder="t('输入消息...')"
          :disabled="!selectedDefinitionId && !activeSessionId"
          :class="composerTextareaClass"
          @keydown="handleKeydown"
        />

        <div class="mt-2 flex items-center justify-between gap-2 px-1">
          <div class="flex min-h-5 flex-wrap items-center gap-1">
            <AgentSelector compact :disabled="isRunActive" />
            <AgentProviderSelector
              compact
              :providers="llmProviders"
              :model-value="selectedProviderId"
              :disabled="isRunActive || llmProviders.length === 0"
              @update:model-value="handleProviderChange"
            />
          </div>

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
