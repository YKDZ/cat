<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { codeToHtml } from "shiki";
import { Button } from "@cat/app-ui";
import { toast } from "vue-sonner";
import { detectLanguage } from "../types";
import type { FileInfo } from "../types";
import { Download, Copy } from "lucide-vue-next";

const props = defineProps<{
  fileUrl: string;
  fileName: string;
  fileInfo: FileInfo;
  highlightStartLine?: number | null;
  highlightEndLine?: number | null;
}>();

const { t } = useI18n();

const INITIAL_BYTE_LIMIT = 30 * 1024;
const LOAD_BYTE_LIMIT = 30 * 1024;

const content = ref("");
const totalBytes = ref(0);
const loadedBytes = ref(0);
const isLoading = ref(false);
const highlightedHtml = ref("");
const hasMoreContent = ref(false);

const emit = defineEmits<{
  (e: "update:total-bytes", bytes: number): void;
}>();

const detectedLanguage = computed(() =>
  detectLanguage(props.fileName, props.fileInfo.extension),
);

const resolveDownloadUrl = (rawUrl: string): string => {
  if (rawUrl.startsWith("/api/storage/download/")) return rawUrl;
  return `/api/storage/download/${rawUrl}`;
};

const fetchContent = async (append = false) => {
  if (isLoading.value) return;

  isLoading.value = true;

  try {
    const startByte = append ? loadedBytes.value : 0;
    const byteLimit = append ? LOAD_BYTE_LIMIT : INITIAL_BYTE_LIMIT;
    const endByte = startByte + byteLimit;
    const url = resolveDownloadUrl(props.fileUrl);

    const response = await fetch(url, {
      headers: {
        range: `bytes=${startByte}-${endByte}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentRange = response.headers.get("content-range");

    if (contentRange) {
      const match = contentRange.match(/bytes \d+-\d+\/(\d+)/);
      if (match?.[1]) {
        totalBytes.value = parseInt(match[1], 10);
      }

      if (!append) {
        const text = await response.text();
        const returnedBytes = new Blob([text]).size;
        const nextRange = response.headers.get("next-range");
        const nextStartByte = nextRange ? parseInt(nextRange, 10) : null;

        loadedBytes.value =
          nextStartByte !== null ? nextStartByte : returnedBytes;

        const hasMore =
          returnedBytes >= INITIAL_BYTE_LIMIT &&
          loadedBytes.value < totalBytes.value;
        hasMoreContent.value = hasMore;
        content.value = text;
        await highlightCode();
        isLoading.value = false;

        // 通知父组件更新 totalBytes
        emit("update:total-bytes", totalBytes.value);

        return;
      }
    } else if (!append) {
      const text = await response.text();
      totalBytes.value = new Blob([text]).size;
      content.value = text;
      await highlightCode();
      hasMoreContent.value = false;
      isLoading.value = false;

      // 通知父组件更新 totalBytes
      emit("update:total-bytes", totalBytes.value);
      return;
    }

    const text = await response.text();
    const returnedBytes = new Blob([text]).size;
    const nextRange = response.headers.get("next-range");
    const nextStartByte = nextRange ? parseInt(nextRange, 10) : null;

    if (append && nextStartByte !== null) {
      loadedBytes.value = nextStartByte;
    } else if (append) {
      loadedBytes.value += returnedBytes;
    } else {
      loadedBytes.value = returnedBytes;
    }

    if (append) {
      content.value += text;
      await highlightCode();
    } else {
      content.value = text;
      await highlightCode();
    }

    const hasMore = loadedBytes.value < totalBytes.value;
    hasMoreContent.value = hasMore;
  } catch (error) {
    toast.error(t("加载文件内容失败"));
  } finally {
    isLoading.value = false;
  }
};

const highlightCode = async () => {
  try {
    const html = await codeToHtml(content.value, {
      lang: detectedLanguage.value,
      theme: "github-light",
      transformers: [
        {
          line(node, line) {
            this.addClassToHast(node, "line");
            node.properties["data-line"] = line + 1;
          },
        },
      ],
    });
    highlightedHtml.value = addLineNumbers(html);
  } catch {
    highlightedHtml.value = "";
  }
};

const addLineNumbers = (html: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const codeElement = doc.querySelector("code");

  if (!codeElement) return html;

  const lines = Array.from(codeElement.querySelectorAll(".line"));

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const lineWithNumber = doc.createElement("div");
    const shouldHighlight =
      props.highlightStartLine !== null &&
      props.highlightEndLine !== null &&
      lineNumber >= (props.highlightStartLine ?? 0) &&
      lineNumber <= (props.highlightEndLine ?? 0);
    lineWithNumber.className = shouldHighlight
      ? "line-with-number line-highlight"
      : "line-with-number";

    const numberSpan = doc.createElement("span");
    numberSpan.className = "line-number";
    numberSpan.textContent = lineNumber.toString();

    const lineContent = line.cloneNode(true) as Element;
    lineContent.classList.remove("line");

    lineWithNumber.appendChild(numberSpan);
    lineWithNumber.appendChild(lineContent);
    line.parentNode?.replaceChild(lineWithNumber, line);
  });

  return codeElement.innerHTML;
};

const loadMore = () => {
  fetchContent(true);
};

const copyContent = async () => {
  try {
    const response = await fetch(resolveDownloadUrl(props.fileUrl));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    await navigator.clipboard.writeText(text);
    toast.success(t("已复制到剪贴板"));
  } catch {
    toast.error(t("复制失败"));
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
    content.value = "";
    highlightedHtml.value = "";
    loadedBytes.value = 0;
    fetchContent();
  },
  { immediate: true },
);

defineExpose({
  loadMore,
  hasMoreContent: computed(() => hasMoreContent.value),
  isLoading: computed(() => isLoading.value),
});
</script>

<template>
  <div class="relative">
    <div
      v-if="isLoading && !content"
      class="flex items-center justify-center py-12"
    >
      <div
        class="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"
      ></div>
    </div>

    <div
      v-else-if="highlightedHtml"
      class="overflow-auto"
      :style="{ maxHeight: hasMoreContent ? '500px' : '600px' }"
      v-html="highlightedHtml"
    ></div>

    <div v-else-if="content" class="p-4 font-mono text-sm whitespace-pre-wrap">
      {{ content }}
    </div>

    <div
      v-if="hasMoreContent"
      class="flex justify-center border-t bg-muted px-4 py-3"
    >
      <Button
        variant="outline"
        size="sm"
        @click="loadMore"
        :disabled="isLoading"
      >
        {{ t("加载更多") }}
      </Button>
    </div>

    <div
      class="flex items-center justify-between border-t bg-muted px-4 py-2 text-xs text-muted-foreground"
    >
      <span>{{ t("文本文件") }} · {{ detectedLanguage }}</span>
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" @click="copyContent">
          <Copy />
        </Button>
        <Button variant="ghost" size="sm" @click="downloadFile">
          <Download />
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.shiki) {
  padding: 1rem 0;
  background-color: transparent !important;
  overflow-x: auto;
  font-family:
    ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono",
    monospace;
}

:deep(.shiki .line) {
  display: block;
  min-height: 1.5rem;
  white-space: pre;
}

:deep(.shiki code) {
  display: inline-block;
  counter-reset: line;
  font-family: inherit;
  min-width: 100%;
}

:deep(.line-with-number) {
  display: flex;
  min-height: 1.5rem;
}

:deep(.line-number) {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 3rem;
  padding-right: 1rem;
  font-size: 0.75rem;
  line-height: 1.5rem;
  color: rgba(120, 120, 120, 0.5);
  user-select: none;
  border-right: 1px solid rgba(120, 120, 120, 0.2);
  margin-right: 1rem;
  flex-shrink: 0;
  position: sticky;
  left: 0;
  background-color: var(--background);
}

:deep(.line-with-number > span:last-child) {
  white-space: pre;
  flex: 1;
}

:deep(.line-highlight) {
  background-color: color-mix(in srgb, var(--primary) 12%, transparent);
}
</style>
