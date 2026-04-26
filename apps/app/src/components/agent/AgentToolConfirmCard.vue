<script setup lang="ts">
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cat/ui";
import {
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "@lucide/vue";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import type { PendingToolConfirmation } from "@/stores/agent";

import { useAgentStore } from "@/stores/agent";

const props = defineProps<{
  confirmation: PendingToolConfirmation;
}>();

const { t } = useI18n();
const agentStore = useAgentStore();
const detailsOpen = ref(false);

const riskIcon = computed(() => {
  const level = props.confirmation.riskLevel;
  if (level === "high") return ShieldAlert;
  if (level === "medium") return ShieldQuestion;
  return ShieldCheck;
});

const riskVariant = computed<"default" | "secondary" | "destructive">(() => {
  const level = props.confirmation.riskLevel;
  if (level === "high") return "destructive";
  if (level === "medium") return "default";
  return "secondary";
});

const riskLabel = computed(() => {
  const level = props.confirmation.riskLevel;
  if (level === "high") return t("高风险");
  if (level === "medium") return t("中风险");
  return t("低风险");
});

const formattedArgs = computed(() => {
  try {
    return JSON.stringify(props.confirmation.arguments, null, 2);
  } catch {
    return String(props.confirmation.arguments);
  }
});

const hasNonEmptyArgs = computed(() => {
  return formattedArgs.value && formattedArgs.value !== "{}";
});

const handleAllow = () => {
  void agentStore.respondToConfirmation("allow_once");
};

const handleTrustTool = () => {
  void agentStore.respondToConfirmation("trust_tool_for_session");
};

const handleTrustAll = () => {
  void agentStore.respondToConfirmation("trust_all_for_session");
};

const handleDeny = () => {
  void agentStore.respondToConfirmation("deny");
};
</script>

<template>
  <Collapsible
    v-model:open="detailsOpen"
    class="rounded-lg border bg-background shadow-sm"
  >
    <!-- Header: tool icon / name / risk badge / expand trigger -->
    <div class="flex items-center gap-2 px-3 py-2">
      <component
        :is="riskIcon"
        class="size-4 shrink-0"
        :class="{
          'text-destructive': confirmation.riskLevel === 'high',
          'text-yellow-500': confirmation.riskLevel === 'medium',
          'text-muted-foreground': confirmation.riskLevel === 'low',
        }"
      />
      <span class="flex-1 truncate text-xs font-medium">
        {{ confirmation.toolName }}
      </span>
      <Badge
        v-if="confirmation.nodeId"
        variant="outline"
        class="shrink-0 text-[10px]"
      >
        {{ t("节点 {id}", { id: confirmation.nodeId }) }}
      </Badge>
      <Badge :variant="riskVariant" class="shrink-0 text-[10px]">
        {{ riskLabel }}
      </Badge>
      <!-- Expand/collapse details -->
      <CollapsibleTrigger
        v-if="hasNonEmptyArgs"
        class="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ChevronRight
          class="size-3.5 transition-transform"
          :class="{ 'rotate-90': detailsOpen }"
        />
      </CollapsibleTrigger>
    </div>

    <!-- Description -->
    <p class="px-3 pb-2 text-[11px] leading-snug text-muted-foreground">
      {{ confirmation.description }}
    </p>

    <!-- Collapsible details: tool arguments -->
    <CollapsibleContent>
      <div class="border-t px-3 py-2">
        <p
          class="mb-1 text-[10px] font-semibold text-muted-foreground uppercase"
        >
          {{ t("参数") }}
        </p>
        <div
          class="max-h-32 overflow-auto rounded bg-muted [&::-webkit-scrollbar]:size-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent"
        >
          <pre class="p-1.5 text-[10px] leading-tight">{{ formattedArgs }}</pre>
        </div>
      </div>
    </CollapsibleContent>

    <!-- Actions -->
    <div class="flex items-center gap-1.5 border-t px-3 py-2">
      <!-- Split button: Allow + dropdown for more options -->
      <div class="flex">
        <Button
          size="sm"
          variant="default"
          class="rounded-r-none text-xs"
          @click="handleAllow"
        >
          {{ t("允许") }}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              size="sm"
              variant="default"
              class="rounded-l-none border-l border-l-primary-foreground/20 px-1"
            >
              <ChevronDown class="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" :side-offset="4">
            <DropdownMenuItem @click="handleTrustTool">
              {{ t("在此会话中信任该工具") }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="handleTrustAll">
              {{ t("在此会话中信任所有工具") }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button size="sm" variant="ghost" class="text-xs" @click="handleDeny">
        {{ t("拒绝") }}
      </Button>
    </div>
  </Collapsible>
</template>
