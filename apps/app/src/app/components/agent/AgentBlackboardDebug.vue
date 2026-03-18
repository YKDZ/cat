<script setup lang="ts">
import {
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@cat/ui";
import { ChevronRight } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  blackboard: Record<string, unknown>;
}>();


const { t } = useI18n();
const open = ref(false);


const pretty = computed(() => {
  try {
    return JSON.stringify(props.blackboard, null, 2);
  } catch {
    return t("黑板数据不可序列化");
  }
});
</script>

<template>
  <Collapsible
    v-model:open="open"
    class="rounded-md border border-border/70 bg-muted/20"
  >
    <CollapsibleTrigger
      class="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-muted/40"
    >
      <ChevronRight
        class="size-3 transition-transform"
        :class="{ 'rotate-90': open }"
      />
      <span class="flex-1 font-medium">{{ t("Blackboard 调试") }}</span>
      <Badge variant="outline" class="h-4 px-1 text-[10px]">
        {{ t("开发") }}
      </Badge>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="border-t p-2">
        <div
          class="max-h-52 overflow-auto rounded bg-background [&::-webkit-scrollbar]:size-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent"
        >
          <pre class="p-2 text-[10px] leading-tight">{{ pretty }}</pre>
        </div>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
