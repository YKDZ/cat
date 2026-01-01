<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted } from "vue";
import TaggedTranslation from "./TaggedTranslation.vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useI18n } from "vue-i18n";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/app/components/ui/resizable";

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
    class="bg-background border-t bg-op-50 flex h-fit max-w-full w-full backdrop-blur-sm"
  >
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel>
        <textarea
          ref="inputTextareaEl"
          v-model="translationValue"
          :placeholder="t('在此输入译文')"
          class="px-5 pt-5 outline-0 min-h-32 w-full"
        />
      </ResizablePanel>
      <ResizableHandle :with-handle="true" />
      <ResizablePanel>
        <div class="px-5 pt-5 flex flex-col gap-5 min-h-32">
          <TaggedTranslation />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
</template>
