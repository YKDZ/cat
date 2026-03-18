<script setup lang="ts">
import { Button } from "@cat/ui";
import { Bot } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";

import { useAgentStore } from "@/app/stores/agent";

const { t } = useI18n();
const agentStore = useAgentStore();
const { definitions, selectedDefinitionId } = storeToRefs(agentStore);


const handleSelect = (id: string) => {
  agentStore.selectDefinition(id);
};
</script>

<template>
  <div class="flex flex-col gap-1">
    <p class="px-1 text-xs font-medium text-muted-foreground">
      {{ t("选择 Agent") }}
    </p>
    <div
      v-if="definitions.length === 0"
      class="px-1 text-xs text-muted-foreground"
    >
      {{ t("暂无可用 Agent") }}
    </div>
    <Button
      v-for="def in definitions"
      :key="def.id"
      variant="ghost"
      size="sm"
      class="w-full justify-start gap-2"
      :class="{
        'bg-accent': selectedDefinitionId === def.id,
      }"
      @click="handleSelect(def.id)"
    >
      <Bot class="size-4 shrink-0" />
      <div class="flex flex-col items-start overflow-hidden">
        <span class="truncate text-sm font-medium">{{ def.name }}</span>
        <span
          v-if="def.description"
          class="truncate text-[10px] text-muted-foreground"
        >
          {{ def.description }}
        </span>
      </div>
    </Button>
  </div>
</template>
