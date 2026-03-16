<script setup lang="ts">
import { computed } from "vue";
import { BlobView } from "@/app/components/blob-view";
import { detectFileType } from "@/app/components/blob-view/types";
import { useEditorTableStore } from "@/app/stores/editor/table";
import { orpc } from "@/server/orpc";
import { SidebarContent } from "@cat/ui";
import { useQuery } from "@pinia/colada";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import SourcePreviewViewer from "./SourcePreviewViewer.vue";

const { t } = useI18n();
const { elementId } = storeToRefs(useEditorTableStore());

// Query 1: source location metadata (per element, lightweight DB query)
const { state: locationState } = useQuery({
  key: () => ["element", elementId.value, "sourceLocation"],
  query: () => {
    if (elementId.value) {
      return orpc.element.getSourceLocation({ elementId: elementId.value });
    }
    return Promise.resolve(null);
  },
  enabled: !import.meta.env.SSR,
});

const locationData = computed(() => locationState.value.data);
const blobId = computed(() => locationData.value?.blobId ?? null);
const fileUrl = computed(() => locationData.value?.fileUrl ?? null);
const fileName = computed(() => locationData.value?.fileName ?? null);

const isTextFile = computed(() => {
  if (!fileName.value) return false;
  return detectFileType(fileName.value).type === "text";
});

const resolveUrl = (rawUrl: string): string =>
  rawUrl.startsWith("/api/storage/download/")
    ? rawUrl
    : `/api/storage/download/${rawUrl}`;

// Query 2: text content (only for text files, cached by blobId across elements)
const { state: contentState } = useQuery({
  key: () => ["blob-content", blobId.value],
  query: async () => {
    const url = fileUrl.value;
    if (!url) return null;
    const response = await fetch(resolveUrl(url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  },
  enabled: () =>
    !import.meta.env.SSR &&
    isTextFile.value &&
    blobId.value !== null &&
    fileUrl.value !== null,
  staleTime: 5 * 60 * 1000,
});
</script>

<template>
  <SidebarContent>
    <!-- Loading location -->
    <div
      v-if="locationState.status === 'pending'"
      class="flex items-center justify-center py-12"
    >
      <div
        class="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"
      ></div>
    </div>

    <!-- No source file -->
    <div
      v-else-if="!locationData?.fileUrl"
      class="p-4 text-sm text-muted-foreground"
    >
      {{ t("此元素没有关联的源文件") }}
    </div>

    <!-- Text file: windowed preview with content caching -->
    <template v-else-if="isTextFile">
      <div
        v-if="contentState.status === 'pending'"
        class="flex items-center justify-center py-12"
      >
        <div
          class="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"
        ></div>
      </div>
      <SourcePreviewViewer
        v-else-if="contentState.data"
        :content="contentState.data"
        :file-name="locationData.fileName!"
        :highlight-start-line="locationData.sourceStartLine"
        :highlight-end-line="locationData.sourceEndLine"
      />
    </template>

    <!-- Non-text file (PDF, Image, etc.): BlobView compact, preserves plugin extensibility -->
    <BlobView
      v-else
      :file-url="locationData.fileUrl"
      :file-name="locationData.fileName!"
      :highlight-start-line="locationData.sourceStartLine"
      :highlight-end-line="locationData.sourceEndLine"
      compact
    />
  </SidebarContent>
</template>
