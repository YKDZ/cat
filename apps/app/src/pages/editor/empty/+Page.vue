<script setup lang="ts">
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/rpc/orpc";
const { t } = useI18n();
const pageContext = usePageContext();

const redirectToCanonical = async () => {
  const { documentId, languageToId } = pageContext.routeParams as {
    documentId?: string;
    languageToId?: string;
  };

  if (!documentId || !languageToId) {
    await navigate("/");
    return;
  }

  const search = new URLSearchParams(
    pageContext.urlParsed.searchOriginal ?? "",
  );
  const branchIdRaw = search.get("branchId");
  const branchId = branchIdRaw ? Number.parseInt(branchIdRaw, 10) : undefined;
  const document = await orpc.document.get({
    documentId,
    branchId: Number.isInteger(branchId) ? branchId : undefined,
  });

  if (!document) {
    await navigate("/");
    return;
  }

  search.set("nodes", documentId);
  const suffix = search.toString();
  await navigate(
    `/editor/project/${document.projectId}/${languageToId}/empty${suffix ? `?${suffix}` : ""}`,
  );
};

onMounted(() => {
  void redirectToCanonical();
});
</script>

<template>
  <div
    class="flex h-full w-full items-center justify-center p-8 text-sm text-muted-foreground"
  >
    {{ t("加载中...") }}
  </div>
</template>
