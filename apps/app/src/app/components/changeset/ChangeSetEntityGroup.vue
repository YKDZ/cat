<script setup lang="ts">
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cat/ui";
import { ChevronDown, ChevronRight } from "@lucide/vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import ChangeSetGenericDiffCard from "./ChangeSetGenericDiffCard.vue";

const { t } = useI18n();

type Entry = {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  fieldPath: string | null;
  riskLevel: string;
  reviewStatus: string;
  asyncStatus: string | null;
};

const props = defineProps<{
  entityType: string;
  entries: Entry[];
}>();

const emit = defineEmits<{
  (e: "approve", entryId: number): void;
  (e: "reject", entryId: number): void;
}>();

const isOpen = ref(true);
</script>

<template>
  <Collapsible v-model:open="isOpen" class="rounded-lg border">
    <CollapsibleTrigger
      class="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <div class="flex items-center gap-2">
        <component
          :is="isOpen ? ChevronDown : ChevronRight"
          class="size-4 text-muted-foreground"
        />
        <span class="text-sm font-medium">{{ entityType }}</span>
        <span class="text-xs text-muted-foreground">
          {{ t("{count} 条变更", { count: entries.length }) }}
        </span>
      </div>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="flex flex-col gap-2 px-4 pt-1 pb-4">
        <ChangeSetGenericDiffCard
          v-for="entry in entries"
          :key="entry.id"
          :entry="entry"
          @approve="emit('approve', $event)"
          @reject="emit('reject', $event)"
        />
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
