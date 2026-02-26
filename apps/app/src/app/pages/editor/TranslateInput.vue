<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted } from "vue";
import TokenizedTranslation from "./TokenizedTranslation.vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useI18n } from "vue-i18n";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@cat/app-ui";

const { t } = useI18n();

const { translationValue, inputTextareaEl } = storeToRefs(
  useEditorTableStore(),
);

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
        <textarea
          ref="inputTextareaEl"
          v-model="translationValue"
          :placeholder="t('在此输入译文')"
          class="min-h-32 w-full px-5 pt-5 outline-0"
        />
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
