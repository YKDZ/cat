<script setup lang="ts">
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Badge,
} from "@cat/ui";
import {
  ChevronRight,
  Wrench,
  Monitor,
  Check,
  X,
  Loader2,
} from "lucide-vue-next";
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";

import type { AgentToolCallItem } from "@/app/stores/agent";

const props = defineProps<{
  toolCall: AgentToolCallItem;
}>();


const { t } = useI18n();
const isOpen = ref(false);


const hasError = computed(() => !!props.toolCall.error);
const isRunning = computed(
  () =>
    props.toolCall.result === null &&
    !props.toolCall.error &&
    props.toolCall.durationMs === null,
);
const isClientTool = computed(() => props.toolCall.target === "client");
const wasDenied = computed(
  () => props.toolCall.confirmationStatus === "user_denied",
);
const durationLabel = computed(() => {
  if (
    props.toolCall.durationMs === null ||
    props.toolCall.durationMs === undefined
  )
    return null;
  return `${props.toolCall.durationMs}ms`;
});


const formattedArgs = computed(() => {
  try {
    return JSON.stringify(props.toolCall.arguments, null, 2);
  } catch {
    return String(props.toolCall.arguments);
  }
});


const formattedResult = computed(() => {
  if (props.toolCall.error) return props.toolCall.error;
  try {
    return JSON.stringify(props.toolCall.result, null, 2);
  } catch {
    return String(props.toolCall.result);
  }
});
</script>

<template>
  <Collapsible v-model:open="isOpen" class="rounded-md border bg-background">
    <CollapsibleTrigger
      class="flex w-full items-center gap-1.5 px-2 py-1 text-xs hover:bg-muted/50"
    >
      <ChevronRight
        class="size-3 shrink-0 transition-transform"
        :class="{ 'rotate-90': isOpen }"
      />
      <Wrench class="size-3 shrink-0 text-muted-foreground" />
      <span class="flex-1 truncate text-left font-medium">
        {{ toolCall.toolName }}
      </span>
      <Badge
        v-if="toolCall.nodeId"
        variant="outline"
        class="h-4 px-1 text-[10px]"
      >
        {{ t("节点 {id}", { id: toolCall.nodeId }) }}
      </Badge>
      <Badge v-if="isClientTool" variant="outline" class="h-4 px-1 text-[10px]">
        <Monitor class="mr-0.5 size-2.5" />
        {{ t("客户端") }}
      </Badge>
      <Badge
        v-if="durationLabel"
        variant="outline"
        class="h-4 px-1 text-[10px]"
      >
        {{ durationLabel }}
      </Badge>
      <Loader2
        v-if="isRunning"
        class="size-3 animate-spin text-muted-foreground"
      />
      <X
        v-else-if="wasDenied"
        class="size-3 text-yellow-500"
        :title="t('用户拒绝')"
      />
      <Check v-else-if="!hasError" class="size-3 text-green-600" />
      <X v-else class="size-3 text-destructive" />
    </CollapsibleTrigger>

    <CollapsibleContent>
      <div class="space-y-2 border-t px-2 py-1.5">
        <!-- Arguments -->
        <div>
          <p
            class="mb-0.5 text-[10px] font-semibold text-muted-foreground uppercase"
          >
            {{ t("参数") }}
          </p>
          <div
            class="max-h-32 overflow-x-auto overflow-y-auto rounded bg-muted [&::-webkit-scrollbar]:size-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent"
          >
            <pre class="p-1.5 text-[10px] leading-tight">{{
              formattedArgs
            }}</pre>
          </div>
        </div>

        <!-- Result -->
        <div v-if="!isRunning">
          <p
            class="mb-0.5 text-[10px] font-semibold text-muted-foreground uppercase"
          >
            {{ hasError ? t("错误") : t("结果") }}
          </p>
          <div
            class="max-h-32 overflow-x-auto overflow-y-auto rounded [&::-webkit-scrollbar]:size-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent"
            :class="[
              hasError ? 'bg-destructive/10 text-destructive' : 'bg-muted',
            ]"
          >
            <pre class="p-1.5 text-[10px] leading-tight">{{
              formattedResult
            }}</pre>
          </div>
        </div>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
