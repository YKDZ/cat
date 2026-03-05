<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, watch } from "vue";
import TokenizedTranslation from "./TokenizedTranslation.vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useI18n } from "vue-i18n";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@cat/app-ui";

const { t } = useI18n();

const tableStore = useEditorTableStore();
const { translationValue, showGhost, inputTextareaEl, ghostText } =
  storeToRefs(tableStore);

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Tab" && showGhost.value) {
    e.preventDefault();
    tableStore.acceptGhostText();
  } else if (e.key === "Escape" && ghostText.value !== null) {
    e.preventDefault();
    tableStore.clearGhostText();
  }
};

onMounted(() => {
  if (inputTextareaEl.value) {
    inputTextareaEl.value.focus();
  }
});
</script>

<template>
  <div
    class="bg-op-50 flex h-fit w-full max-w-full border-t bg-background backdrop-blur-sm"
  >
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel>
        <div class="relative">
          <textarea
            ref="inputTextareaEl"
            v-model="translationValue"
            :placeholder="showGhost ? '' : t('在此输入译文')"
            class="relative z-10 min-h-32 w-full bg-transparent px-5 pt-5 outline-0"
            @keydown="handleKeydown"
          />
          <!-- Ghost text overlay -->
          <div
            v-if="showGhost"
            class="pointer-events-none absolute inset-0 z-0 px-5 pt-5 whitespace-pre-wrap"
            aria-hidden="true"
          >
            <span class="text-transparent">{{ translationValue }}</span
            ><span class="text-muted-foreground/50">{{
              ghostText!.slice(translationValue.length)
            }}</span>
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle :with-handle="true" />
      <ResizablePanel>
        <div class="flex min-h-32 flex-col gap-5 px-5 pt-5">
          <TokenizedTranslation />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
</template>
