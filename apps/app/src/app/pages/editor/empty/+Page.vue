<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Button } from "@cat/ui";
import { RefreshCw, FileText } from "lucide-vue-next";
import { navigate } from "vike/client/router";
import { usePageContext } from "vike-vue/usePageContext";
import { orpc } from "@/server/orpc";
import { ref } from "vue";
import { useToastStore } from "@/app/stores/toast";

const { info } = useToastStore();
const { t } = useI18n();
const pageContext = usePageContext();

const isLoading = ref(false);

const handleRefresh = async () => {
  isLoading.value = true;

  try {
    const { documentId, languageToId } = pageContext.routeParams as {
      documentId: string;
      languageToId: string;
    };

    if (!documentId || !languageToId) {
      navigate("/");
      return;
    }

    // 尝试查找第一个未翻译的元素
    const firstUntranslatedElement = await orpc.document.getFirstElement({
      documentId,
      isTranslated: false,
      languageId: languageToId,
    });

    if (firstUntranslatedElement) {
      // 找到未翻译的元素，跳转到该元素
      navigate(
        `/editor/${documentId}/${languageToId}/${firstUntranslatedElement.id}`,
      );
      return;
    }

    // 如果没有未翻译的元素，尝试查找第一个元素（无论翻译状态）
    const elements = await orpc.document.getElements({
      documentId,
      page: 0,
      pageSize: 1,
    });

    const firstAnyElement = elements.at(0);
    if (firstAnyElement) {
      // 找到元素，跳转到该元素
      navigate(`/editor/${documentId}/${languageToId}/${firstAnyElement.id}`);
      return;
    }

    // 仍然没有元素，刷新当前页面
    info(t("没有找到可用元素"));
  } catch (error) {
    navigate(location.pathname);
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div
    class="flex h-full w-full flex-col items-center justify-center gap-6 p-8"
  >
    <div class="flex flex-col items-center gap-4 text-center">
      <div
        class="flex size-20 items-center justify-center rounded-full bg-muted"
      >
        <FileText class="size-10 text-muted-foreground" />
      </div>

      <article class="prose-foreground max-w-460px prose">
        <h2>{{ t("暂无可翻译内容") }}</h2>
        <p>{{ t("此文档没有任何可翻译元素") }}</p>
        <p>
          {{ t("它可能正在被预处理，或刚刚被创建而未被分配可翻译元素") }}
        </p>
      </article>

      <Button
        variant="outline"
        @click="handleRefresh"
        class="gap-2"
        :disabled="isLoading"
      >
        <RefreshCw class="size-4" :class="{ 'animate-spin': isLoading }" />
        {{ isLoading ? t("刷新中...") : t("刷新") }}
      </Button>
    </div>
  </div>
</template>
