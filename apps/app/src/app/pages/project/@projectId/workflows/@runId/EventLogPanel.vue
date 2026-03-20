<script setup lang="ts">
import {
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ScrollArea,
} from "@cat/ui";
import { ChevronDown } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { useWorkflowStore } from "@/app/stores/workflow";

const { t } = useI18n();
const workflowStore = useWorkflowStore();


const events = computed(() => workflowStore.eventLog);


const expandedSet = ref(new Set<string>());


const toggleExpand = (id: string): void => {
  if (expandedSet.value.has(id)) {
    expandedSet.value.delete(id);
  } else {
    expandedSet.value.add(id);
  }
  expandedSet.value = new Set(expandedSet.value);
};


const eventBadgeVariant = (
  type: string,
): "secondary" | "outline" | "destructive" => {
  if (type.includes("error")) return "destructive";
  if (type.includes("end") || type.includes("complete")) return "secondary";
  return "outline";
};
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="shrink-0 border-b px-4 py-2">
      <span class="text-sm font-medium">{{ t("事件日志") }}</span>
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <div class="space-y-1 p-2">
        <Collapsible
          v-for="event in events"
          :key="event.eventId"
          :open="expandedSet.has(event.eventId)"
          @update:open="() => toggleExpand(event.eventId)"
        >
          <CollapsibleTrigger as-child>
            <button
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted/50"
            >
              <Badge
                :variant="eventBadgeVariant(event.type)"
                class="h-4 shrink-0 px-1 font-mono text-[9px]"
              >
                {{ event.type }}
              </Badge>
              <span v-if="event.nodeId" class="truncate text-muted-foreground">
                {{ event.nodeId }}
              </span>
              <span class="ml-auto shrink-0 text-muted-foreground">
                {{ new Date(event.timestamp).toLocaleTimeString() }}
              </span>
              <ChevronDown
                class="size-3 shrink-0 transition-transform"
                :class="{ 'rotate-180': expandedSet.has(event.eventId) }"
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre
              class="mx-2 mb-1 overflow-auto rounded bg-muted/50 p-2 font-mono text-[10px]"
              >{{ JSON.stringify(event.payload, null, 2) }}</pre
            >
          </CollapsibleContent>
        </Collapsible>

        <p
          v-if="events.length === 0"
          class="p-4 text-center text-xs text-muted-foreground"
        >
          {{ t("暂无事件") }}
        </p>
      </div>
    </ScrollArea>
  </div>
</template>
