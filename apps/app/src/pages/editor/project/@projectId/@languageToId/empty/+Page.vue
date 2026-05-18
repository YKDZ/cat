<script setup lang="ts">
import { Button } from "@cat/ui";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import {
  buildEditorHref,
  parseEditorScopeFromRoute,
} from "../../../../scope-url";

const pageContext = usePageContext();
const { t } = useI18n();

const scope = computed(() =>
  parseEditorScopeFromRoute({
    projectId: pageContext.routeParams.projectId,
    languageToId: pageContext.routeParams.languageToId,
    searchParams: new URLSearchParams(
      pageContext.urlParsed.searchOriginal ?? "",
    ),
  }),
);

const scopeLabel = computed(() =>
  scope.value.contentNodeIds.length === 0
    ? t("整个项目")
    : t("已选择 {count} 个内容节点", {
        count: scope.value.contentNodeIds.length,
      }),
);

const hasSearch = computed(() => scope.value.searchQuery.trim().length > 0);
const hasStatusFilter = computed(() => scope.value.statusFilter !== "all");
const hasNodeFilters = computed(() => scope.value.contentNodeIds.length > 0);
const hasBranch = computed(() => scope.value.branchId !== undefined);

const emptyReason = computed(() => {
  if (hasSearch.value || hasStatusFilter.value) {
    return t("当前搜索或状态过滤没有匹配结果");
  }
  if (hasNodeFilters.value) {
    return t("所选内容节点及其子节点没有可翻译元素");
  }
  if (hasBranch.value) {
    return t("当前分支可见范围没有可翻译元素");
  }
  return t("整个项目还没有可翻译元素");
});

const clearSearch = async () => {
  await navigate(
    buildEditorHref({ ...scope.value, searchQuery: "", page: 1 }, "auto"),
  );
};

const clearStatus = async () => {
  await navigate(
    buildEditorHref({ ...scope.value, statusFilter: "all", page: 1 }, "auto"),
  );
};

const viewWholeProject = async () => {
  await navigate(
    buildEditorHref({ ...scope.value, contentNodeIds: [], page: 1 }, "auto"),
  );
};

const backToProject = async () => {
  await navigate(
    `/project/${scope.value.projectId}/index/${scope.value.languageToId}`,
  );
};

const retry = async () => {
  await navigate(buildEditorHref(scope.value, "auto"));
};
</script>

<template>
  <div
    class="flex h-full flex-col items-center justify-center gap-4 text-center"
  >
    <div
      class="icon-[mdi--text-box-search-outline] size-12 text-muted-foreground"
    />
    <div>
      <h2 class="text-lg font-semibold">{{ t("暂无可翻译内容") }}</h2>
      <p class="text-sm text-muted-foreground">
        {{
          t("当前编辑范围没有匹配的可翻译元素：{scope}", { scope: scopeLabel })
        }}
      </p>
      <p class="mt-1 text-sm text-muted-foreground">{{ emptyReason }}</p>
    </div>
    <div class="flex flex-wrap justify-center gap-2">
      <Button v-if="hasSearch" variant="outline" @click="clearSearch">
        {{ t("清除搜索") }}
      </Button>
      <Button v-if="hasStatusFilter" variant="outline" @click="clearStatus">
        {{ t("清除状态过滤") }}
      </Button>
      <Button v-if="hasNodeFilters" variant="outline" @click="viewWholeProject">
        {{ t("查看整个项目") }}
      </Button>
      <Button variant="ghost" @click="backToProject">
        {{ t("返回项目页") }}
      </Button>
      <Button variant="outline" @click="retry">{{ t("重新检查") }}</Button>
    </div>
  </div>
</template>
