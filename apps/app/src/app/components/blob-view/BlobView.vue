<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { FileText } from "lucide-vue-next";
import { detectFileType } from "./types";
import type { FileInfo } from "./types";
import TextViewer from "./renderers/TextViewer.vue";
import PdfViewer from "./renderers/PdfViewer.vue";
import ImageViewer from "./renderers/ImageViewer.vue";
import UnsupportedViewer from "./renderers/UnsupportedViewer.vue";

const props = defineProps<{
  documentId?: string;
  fileUrl?: string | null;
  fileName: string;
  language?: string;
  maxInitialLines?: number;
  /** 要高亮显示的行号范围 */
  highlightStartLine?: number | null;
  /** 要高亮显示的行号范围 */
  highlightEndLine?: number | null;
  /** 紧凑模式（用于侧边栏等空间受限场景，隐藏头部工具栏和外围边框） */
  compact?: boolean;
}>();

const { t } = useI18n();

const fileInfo = computed<FileInfo>(() => detectFileType(props.fileName));

const totalBytes = ref(0);

// 计算文件大小
const fileSize = computed(() => {
  if (totalBytes.value === 0) return t("未知");

  const units = ["B", "KB", "MB", "GB"];
  let size = totalBytes.value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
});

watch(
  () => [props.documentId, props.fileUrl],
  () => {
    totalBytes.value = 0;
  },
);
</script>

<template>
  <div
    :class="compact ? 'overflow-hidden' : 'overflow-hidden rounded-lg border'"
  >
    <!-- 头部工具栏 -->
    <div
      v-if="!compact"
      class="flex items-center justify-between border-b bg-muted px-4 py-2"
    >
      <div class="flex items-center gap-2">
        <FileText class="h-4 w-4 text-muted-foreground" />
        <span class="text-sm font-medium">{{ fileName }}</span>
        <span class="text-xs text-muted-foreground">{{ fileSize }}</span>
        <span
          v-if="fileInfo.isPreviewable"
          class="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary"
        >
          {{ fileInfo.type.toUpperCase() }}
        </span>
      </div>
    </div>

    <!-- 文件内容渲染 -->
    <div class="relative">
      <TextViewer
        v-if="fileInfo.type === 'text' && fileUrl"
        :file-url="fileUrl"
        :file-name="fileName"
        :file-info="fileInfo"
        :highlight-start-line="highlightStartLine"
        :highlight-end-line="highlightEndLine"
        @update:total-bytes="(bytes: number) => (totalBytes = bytes)"
      />

      <PdfViewer
        v-else-if="fileInfo.type === 'pdf' && fileUrl"
        :file-url="fileUrl"
        :file-name="fileName"
        :highlight-start-line="highlightStartLine"
        :highlight-end-line="highlightEndLine"
      />

      <ImageViewer
        v-else-if="fileInfo.type === 'image' && fileUrl"
        :file-url="fileUrl"
        :file-name="fileName"
      />

      <UnsupportedViewer
        v-else-if="fileUrl"
        :file-url="fileUrl"
        :file-name="fileName"
        :file-info="fileInfo"
      />

      <div v-else class="flex items-center justify-center py-12">
        <p class="text-sm text-muted-foreground">
          {{ t("无文件可预览") }}
        </p>
      </div>
    </div>
  </div>
</template>
