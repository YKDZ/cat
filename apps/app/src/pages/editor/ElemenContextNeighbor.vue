<script setup lang="ts">
import type { FlattenedContextEvidence } from "@cat/shared";

import {
  Badge,
  Card,
  CardContent,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@cat/ui";
import { ChevronDownIcon } from "@lucide/vue";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import Markdown from "@/components/Markdown.vue";

const props = defineProps<{
  context: FlattenedContextEvidence;
}>();

const { t } = useI18n();

const open = ref(false);

const textData = computed(() => {
  const payload = props.context.payload;
  if (
    payload &&
    typeof payload === "object" &&
    "text" in payload &&
    typeof payload.text === "string"
  ) {
    return payload.text;
  }
  return "";
});

const meta = computed(() => {
  const payload = props.context.payload;
  if (!payload || typeof payload !== "object") return null;
  return payload as Record<string, unknown>;
});
</script>

<template>
  <Card>
    <CardContent class="flex flex-col gap-2">
      <Badge variant="secondary" class="self-start text-xs">{{
        t("邻居元素")
      }}</Badge>
      <Markdown :content="textData" size="sm" />
      <Collapsible v-model:open="open">
        <CollapsibleTrigger
          class="flex cursor-pointer items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <span>{{ t("元素详情") }}</span>
          <ChevronDownIcon
            class="size-3 transition-transform"
            :class="{ 'rotate-180': open }"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div class="mt-1 flex flex-col gap-0.5">
            <div v-if="meta?.stableSourceRef">
              <span
                class="mr-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground select-none"
                >{{ t("stable ref") }}</span
              >
              <span class="text-xs break-all">{{ meta.stableSourceRef }}</span>
            </div>
            <div v-if="meta?.languageId">
              <span
                class="mr-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground select-none"
                >{{ t("语言") }}</span
              >
              <span class="text-xs">{{ meta.languageId }}</span>
            </div>
            <div
              v-if="meta?.localOrder !== null && meta?.localOrder !== undefined"
            >
              <span
                class="mr-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground select-none"
                >{{ t("位置") }}</span
              >
              <span class="text-xs">{{ meta.localOrder }}</span>
            </div>
            <div v-if="meta?.elementId">
              <span
                class="mr-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground select-none"
                >{{ t("元素 ID") }}</span
              >
              <span class="text-xs">{{ meta.elementId }}</span>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </CardContent>
  </Card>
</template>
