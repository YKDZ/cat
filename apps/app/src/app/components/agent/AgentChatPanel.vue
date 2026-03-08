<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ref, nextTick, watch, onMounted, onUnmounted } from "vue";
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
} from "lucide-vue-next";
import AgentMessageBubble from "./AgentMessageBubble.vue";
import AgentThinkingIndicator from "./AgentThinkingIndicator.vue";
import AgentToolConfirmCard from "./AgentToolConfirmCard.vue";
import AgentMaxStepsCard from "./AgentMaxStepsCard.vue";
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
  activeSessionId,
  selectedDefinitionId,
  selectedDefinition,
  currentSteps,
  errorMessage,
  pendingConfirmation,
  maxStepsReached,
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

            <!-- Streaming response bubble — shows the live text_delta output.
                 Visible whenever the agent is streaming AND there is text being
                 produced.  On finish steps streamingText is preserved, so the
                 bubble smoothly transitions into the permanent MessageBubble
                 created by the 'done' chunk. -->
            <AgentMessageBubble
              v-if="isStreaming && streamingText"
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
    </SidebarFooter>
  </div>
</template>
