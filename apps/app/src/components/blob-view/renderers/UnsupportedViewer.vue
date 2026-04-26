<script setup lang="ts">
import { Button } from "@cat/ui";
import { FileQuestion, Download } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";

const props = defineProps<{
  fileUrl: string;
  fileName: string;
  fileInfo: {
    extension: string;
    mimeType: string;
  };
}>();

const { t } = useI18n();

const resolveDownloadUrl = (rawUrl: string): string => {
  if (rawUrl.startsWith("/api/storage/download/")) return rawUrl;
  return `/api/storage/download/${rawUrl}`;
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
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-6 p-8">
    <FileQuestion class="h-24 w-24 text-muted-foreground/50" />

    <article class="prose-foreground max-w-460px prose">
      <h3>{{ t("无法预览此文件类型") }}</h3>
      <p>
        {{ t("文件类型：.{extension}", { extension: fileInfo.extension }) }}
      </p>
      <p>
        {{ t("MIME: {mimeType}", { mimeType: fileInfo.mimeType }) }}
      </p>
    </article>

    <Button @click="downloadFile">
      <Download class="mr-2 h-4 w-4" />
      {{ t("下载文件") }}
    </Button>
  </div>
</template>
