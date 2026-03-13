<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ref, nextTick, watch, onMounted, onUnmounted, computed } from "vue";
import { storeToRefs } from "pinia";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  ScrollArea,
  Input,
  Button,
} from "@cat/app-ui";
import {
  ArrowRight,
  Plus,
  Square,
  RotateCcw,
  AlertTriangle,
  Pause,
  Play,
} from "lucide-vue-next";
import AgentMessageBubble from "./AgentMessageBubble.vue";
import AgentThinkingIndicator from "./AgentThinkingIndicator.vue";
import AgentToolConfirmCard from "./AgentToolConfirmCard.vue";
import AgentMaxStepsCard from "./AgentMaxStepsCard.vue";
import AgentNodeTimeline from "./AgentNodeTimeline.vue";
import AgentRunResultCard from "./AgentRunResultCard.vue";
import AgentBlackboardDebug from "./AgentBlackboardDebug.vue";
import AgentSelector from "./AgentSelector.vue";
import { useAgentStore } from "@/app/stores/agent";
import { useEditorContextStore } from "@/app/stores/editor/context";
import { useEditorTableStore } from "@/app/stores/editor/table";
import { useRegisterClientTools } from "@/app/utils/agent/register-client-tools";

const { t } = useI18n();
const agentStore = useAgentStore();
const {
  messages,
  streamingText,
  thinkingText,
  streamingStatus,
  isStreaming,
  runId,
  nodeExecutionList,
  llmStreamingNodes,
  blackboardPreview,
  activeSessionId,
  selectedDefinitionId,
  selectedDefinition,
  currentSteps,
  errorMessage,
  pendingConfirmation,
  maxStepsReached,
  graphRunResult,
  lastFinishReason,
} = storeToRefs(agentStore);

const editorContext = storeToRefs(useEditorContextStore());
const editorTable = storeToRefs(useEditorTableStore());
const { elementId: editorElementId, elementLanguageId } = editorTable;

// Register client-side tool handlers for the agent
useRegisterClientTools();

const inputText = ref("");
const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null);

/** 跟踪用户是否处于底部(阈値 80px)，手动向上滚动后不再自动跟随 */
const isAtBottom = ref(true);
const SCROLL_THRESHOLD = 80;

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

onMounted(() => {
  nextTick(() => {
    getViewport()?.addEventListener("scroll", handleScroll, { passive: true });
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
        projectId: editorContext.projectId.value ?? undefined,
        documentId: editorContext.documentId.value,
        languageId: editorContext.languageToId.value,
        sourceLanguageId: elementLanguageId.value ?? undefined,
        elementId: editorElementId.value ?? undefined,
      },
    );
    if (!sessionId) return;
  }

  inputText.value = "";
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

const streamingNodeEntries = computed(() => {
  return [...llmStreamingNodes.value.entries()]
    .filter(([, text]) => text.length > 0)
    .map(([nodeId, text]) => ({ nodeId, text }));
});

const hasBlackboardData = computed(() => {
  return Object.keys(blackboardPreview.value).length > 0;
});

const handleRetry = () => {
  void agentStore.retryLastMessage();
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
        :disabled="isStreaming"
        @click="handleNewSession"
      >
        <Plus class="size-3.5" />
      </Button>
    </div>

    <!-- Chat Messages -->
    <SidebarContent class="flex-1">
      <ScrollArea ref="scrollAreaRef" class="h-full w-full">
        <SidebarGroup>
          <SidebarGroupContent class="flex flex-col gap-2 p-2">
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
              v-if="isStreaming"
              :thinkingText="thinkingText"
              :steps="currentSteps"
            />

            <AgentNodeTimeline
              v-if="nodeExecutionList.length > 0"
              :nodes="nodeExecutionList"
            />

            <AgentBlackboardDebug
              v-if="hasBlackboardData"
              :blackboard="blackboardPreview"
            />

            <!-- Streaming response bubble — shows the live text_delta output.
                 Visible whenever the agent is streaming AND there is text being
                 produced.  On finish steps streamingText is preserved, so the
                 bubble smoothly transitions into the permanent MessageBubble
                 created by the 'done' chunk. -->
            <AgentMessageBubble
              v-if="isStreaming && !runId && streamingText"
              role="ASSISTANT"
              :content="streamingText"
              :isStreaming="true"
            />

            <AgentMessageBubble
              v-for="item in streamingNodeEntries"
              v-if="isStreaming && runId"
              :key="item.nodeId"
              role="ASSISTANT"
              :content="item.text"
              :isStreaming="true"
              :nodeId="item.nodeId"
            />

            <!-- Inline tool confirmation card (appears in message flow) -->
            <AgentToolConfirmCard
              v-if="pendingConfirmation"
              :confirmation="pendingConfirmation"
            />

            <!-- Max steps reached card -->
            <AgentMaxStepsCard v-if="maxStepsReached" :info="maxStepsReached" />

            <AgentRunResultCard
              v-if="graphRunResult"
              :result="graphRunResult"
              @retry="handleRetry"
            />

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

            <!-- Error message with retry -->
            <div
              v-if="streamingStatus === 'error' && errorMessage"
              class="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive"
            >
              <p>{{ errorMessage }}</p>
              <Button
                size="sm"
                variant="ghost"
                class="mt-1.5 text-xs text-destructive hover:text-destructive"
                @click="agentStore.retryLastMessage"
              >
                <RotateCcw class="mr-1 size-3" />
                {{ t("重试") }}
              </Button>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </ScrollArea>
    </SidebarContent>

    <!-- Input Area -->
    <SidebarFooter>
      <div class="flex flex-col gap-2">
        <div
          v-if="runId"
          class="flex items-center gap-1 rounded-md border border-border/60 bg-muted/20 p-1"
        >
          <Button
            v-if="streamingStatus === 'streaming'"
            size="sm"
            variant="outline"
            class="h-7 px-2 text-xs"
            @click="agentStore.pauseGraphRun"
          >
            <Pause class="mr-1 size-3" />
            {{ t("暂停") }}
          </Button>
          <Button
            v-if="streamingStatus === 'paused'"
            size="sm"
            variant="outline"
            class="h-7 px-2 text-xs"
            @click="agentStore.resumeGraphRun"
          >
            <Play class="mr-1 size-3" />
            {{ t("恢复") }}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            class="h-7 px-2 text-xs"
            @click="agentStore.cancelGraphRun"
          >
            <Square class="mr-1 size-3" />
            {{ t("取消运行") }}
          </Button>
        </div>

        <div class="flex gap-1">
          <Input
            v-model="inputText"
            :placeholder="t('输入消息...')"
            :disabled="!selectedDefinitionId && !activeSessionId"
            @keydown="handleKeydown"
          />
          <Button
            v-if="!isStreaming"
            size="icon-sm"
            :disabled="
              !inputText.trim() || (!selectedDefinitionId && !activeSessionId)
            "
            @click="handleSend"
          >
            <ArrowRight />
          </Button>
          <Button
            v-else
            size="icon-sm"
            variant="destructive"
            @click="agentStore.cancelStreaming"
          >
            <Square />
          </Button>
        </div>
      </div>
    </SidebarFooter>
  </div>
</template>
