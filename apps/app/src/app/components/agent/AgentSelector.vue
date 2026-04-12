<script setup lang="ts">
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cat/ui";
import { Bot, Check, ChevronDown } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { useAgentStore } from "@/app/stores/agent";

const props = withDefaults(
  defineProps<{
    compact?: boolean;
    disabled?: boolean;
  }>(),
  {
    compact: false,
    disabled: false,
  },
);

const { t } = useI18n();
const agentStore = useAgentStore();
const { definitions, selectedDefinitionId, selectedDefinition } =
  storeToRefs(agentStore);

const triggerLabel = computed(() => {
  if (definitions.value.length === 0) return t("暂无可用 Agent");
  return selectedDefinition.value?.name ?? t("选择 Agent");
});

const handleSelect = (id: string) => {
  if (props.disabled) return;
  agentStore.selectDefinition(id);
};
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        :variant="compact ? 'ghost' : 'outline'"
        :size="compact ? 'sm' : 'default'"
        :disabled="disabled || definitions.length === 0"
        class="min-w-0 justify-between gap-2"
        :class="compact ? 'h-8 rounded-full px-2.5 text-xs' : 'w-full'"
      >
        <span class="flex min-w-0 items-center gap-2">
          <Bot class="size-4 shrink-0" />
          <span class="truncate">{{ triggerLabel }}</span>
        </span>
        <ChevronDown class="size-3.5 shrink-0 opacity-60" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-72">
      <DropdownMenuItem v-if="definitions.length === 0" disabled>
        {{ t("暂无可用 Agent") }}
      </DropdownMenuItem>
      <DropdownMenuItem
        v-for="def in definitions"
        :key="def.id"
        class="items-start gap-3 py-2"
        @click="handleSelect(def.id)"
      >
        <Bot class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate text-sm font-medium">{{ def.name }}</span>
            <Check
              v-if="selectedDefinitionId === def.id"
              class="ml-auto size-4 shrink-0 text-primary"
            />
          </div>
          <p
            v-if="def.description"
            class="truncate text-xs text-muted-foreground"
          >
            {{ def.description }}
          </p>
        </div>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
