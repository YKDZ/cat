<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { computed } from "vue";
import { Badge } from "@cat/app-ui";
import { Wrench } from "lucide-vue-next";
import AgentToolCallCard from "./AgentToolCallCard.vue";
import type { AgentStepItem } from "@/app/stores/agent";

const props = defineProps<{
  steps: AgentStepItem[];
}>();

const { t } = useI18n();

const sortedSteps = computed(() =>
  [...props.steps].sort((a, b) => a.index - b.index),
);
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="text-xs font-medium text-muted-foreground">
      {{ t("执行步骤") }}
    </p>

    <div
      v-for="step in sortedSteps"
      :key="step.index"
      class="relative flex gap-2 pl-4"
    >
      <!-- Timeline line -->
      <div class="absolute top-0 bottom-0 left-1.5 w-px bg-border" />

      <!-- Step dot -->
      <div
        class="absolute top-1 left-0 z-10 size-3 rounded-full border bg-background"
      />

      <!-- Step content -->
      <div class="flex flex-1 flex-col gap-1 pb-3">
        <div class="flex items-center gap-1">
          <Badge variant="outline" class="h-4 px-1 text-[10px]">
            {{ t("步骤 {n}", { n: step.index + 1 }) }}
          </Badge>
          <Badge
            v-if="step.toolCalls.length > 0"
            variant="secondary"
            class="h-4 gap-0.5 px-1 text-[10px]"
          >
            <Wrench class="size-2.5" />
            {{ step.toolCalls.length }}
          </Badge>
        </div>

        <!-- Thought -->
        <p v-if="step.thought" class="text-xs text-muted-foreground">
          {{ step.thought }}
        </p>

        <!-- Tool calls -->
        <div v-if="step.toolCalls.length > 0" class="flex flex-col gap-1">
          <AgentToolCallCard
            v-for="tc in step.toolCalls"
            :key="tc.id"
            :toolCall="tc"
          />
        </div>
      </div>
    </div>
  </div>
</template>
