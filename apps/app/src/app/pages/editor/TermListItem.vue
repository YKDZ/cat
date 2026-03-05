<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import { navigate } from "vike/client/router";
import { toShortFixed } from "@cat/shared/utils";
import TokenRenderer from "@/app/components/tokenizer/TokenRenderer.vue";
import { useHotKeys } from "@/app/utils/magic-keys.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { Button } from "@cat/app-ui";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";
import { ArrowRight } from "lucide-vue-next";

const props = defineProps<{
  term: {
    term: string;
    translation: string;
    definition?: string | null;
    confidence?: number;
    subjectId?: number | null;
    conceptId?: number;
    glossaryId?: string;
  };
  index: number;
}>();

const { t } = useI18n();
const { insert } = useEditorTableStore();
const { document } = storeToRefs(useEditorContextStore());

const handleInsert = () => {
  insert(props.term.translation);
};

const handleViewConcept = () => {
  if (props.term.glossaryId && props.term.conceptId) {
    navigate(
      `/glossary/${props.term.glossaryId}/concept/${props.term.conceptId}`,
    );
  }
};

useHotKeys(`T+${props.index + 1}`, handleInsert);
</script>

<template>
  <TextTooltip :tooltip="term.definition || t('无显式定义')">
    <div
      class="group flex cursor-pointer flex-col gap-1.5 border-b border-border px-3 py-2 transition-colors last:border-b-0 hover:bg-muted/50"
      @click="handleInsert"
    >
      <div class="flex items-center gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <TokenRenderer
            v-if="document"
            :text="term.term"
            class="truncate font-medium text-foreground"
          />
          <ArrowRight class="mx-1 size-4 shrink-0 text-muted-foreground" />
          <TokenRenderer
            v-if="document"
            :text="term.translation"
            class="truncate text-foreground"
          />
          <span
            v-if="term.confidence !== undefined && term.confidence < 1"
            class="shrink-0 text-xs text-muted-foreground"
          >
            {{
              t("{confidence}%", {
                confidence: toShortFixed(term.confidence * 100, 0),
              })
            }}
          </span>
        </div>
        <Button
          v-if="term.glossaryId && term.conceptId"
          size="icon"
          variant="ghost"
          class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          @click.stop="handleViewConcept"
        >
          <div class="icon-[mdi--information-outline] size-4" />
        </Button>
      </div>
    </div>
  </TextTooltip>
</template>
