<script setup lang="ts">
import { Button } from "@cat/ui";
import { Download } from "@lucide/vue";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";

const props = defineProps<{
  fileUrl: string;
  fileName: string;
}>();

const { t } = useI18n();
const isLoading = ref(true);
const error = ref<string | null>(null);
const imageObjectUrl = ref<string | null>(null);
const imageDimensions = ref<{ width: number; height: number } | null>(null);

const resolveDownloadUrl = (rawUrl: string): string => {
  if (rawUrl.startsWith("/api/storage/download/")) return rawUrl;
  return `/api/storage/download/${rawUrl}`;
};

const loadImage = async () => {
  isLoading.value = true;
  error.value = null;

  try {
    const url = resolveDownloadUrl(props.fileUrl);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    imageObjectUrl.value = URL.createObjectURL(blob);

    // 获取图片尺寸
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        imageDimensions.value = {
          width: img.width,
          height: img.height,
        };
        resolve();
      };
      img.onerror = reject;
      img.src = imageObjectUrl.value!;
    });
  } catch {
    error.value = t("加载图片失败");
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
    if (imageObjectUrl.value) {
      URL.revokeObjectURL(imageObjectUrl.value);
    }
    imageObjectUrl.value = null;
    imageDimensions.value = null;
    loadImage();
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

    <div
      v-else-if="imageObjectUrl"
      class="flex flex-1 items-center justify-center overflow-auto bg-muted/30 p-4"
    >
      <img
        :src="imageObjectUrl"
        :alt="fileName"
        class="max-h-full max-w-full object-contain"
      />
    </div>

    <div
      class="flex items-center justify-between border-t bg-muted px-4 py-2 text-xs"
    >
      <span v-if="imageDimensions" class="text-muted-foreground">
        {{ imageDimensions.width }} × {{ imageDimensions.height }} px
      </span>
      <div class="ml-auto">
        <Button variant="ghost" size="sm" @click="downloadFile">
          <Download />
        </Button>
      </div>
    </div>
  </div>
</template>
