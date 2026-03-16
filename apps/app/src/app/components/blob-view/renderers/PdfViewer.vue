<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@cat/ui";
import { toast } from "vue-sonner";
import { Download } from "lucide-vue-next";

const props = defineProps<{
  fileUrl: string;
  fileName: string;
}>();

const { t } = useI18n();
const isLoading = ref(true);
const error = ref<string | null>(null);
const pdfObjectUrl = ref<string | null>(null);

const resolveDownloadUrl = (rawUrl: string): string => {
  if (rawUrl.startsWith("/api/storage/download/")) return rawUrl;
  return `/api/storage/download/${rawUrl}`;
};

const loadPdf = async () => {
  isLoading.value = true;
  error.value = null;

  try {
    const url = resolveDownloadUrl(props.fileUrl);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    pdfObjectUrl.value = URL.createObjectURL(blob);
  } catch {
    error.value = t("加载 PDF 失败");
  } finally {
    isLoading.value = false;
  }
};

const downloadFile = async () => {
  try {
    const downloadUrl = resolveDownloadUrl(props.fileUrl);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = props.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success(t("下载已开始"));
  } catch {
    toast.error(t("下载失败"));
  }
};

watch(
  () => [props.fileUrl, props.fileName],
  () => {
    if (pdfObjectUrl.value) {
      URL.revokeObjectURL(pdfObjectUrl.value);
    }
    pdfObjectUrl.value = null;
    loadPdf();
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex h-full flex-col">
    <div v-if="isLoading" class="flex flex-1 items-center justify-center">
      <div
        class="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"
      ></div>
    </div>

    <div
      v-else-if="error"
      class="flex flex-1 flex-col items-center justify-center gap-4"
    >
      <p class="text-sm text-destructive">{{ error }}</p>
      <Button variant="outline" @click="downloadFile">
        {{ t("下载文件") }}
      </Button>
    </div>

    <iframe
      v-else-if="pdfObjectUrl"
      :src="pdfObjectUrl"
      class="h-full w-full border-0"
      :title="fileName"
    ></iframe>

    <div class="flex justify-end border-t bg-muted px-4 py-2">
      <Button variant="ghost" size="sm" @click="downloadFile">
        <Download />
      </Button>
    </div>
  </div>
</template>
