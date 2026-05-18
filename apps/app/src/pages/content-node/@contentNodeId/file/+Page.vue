<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { usePageContext } from "vike-vue/usePageContext";
import { useI18n } from "vue-i18n";

import { BlobView } from "@/components/blob-view";

import type { Data } from "./+data.server";

const { fileInfo, fileUrl } = useData<Data>();
const pageContext = usePageContext();
const { t } = useI18n();
const { contentNodeId } = pageContext.routeParams as {
  contentNodeId?: string;
};
</script>

<template>
  <div class="p-6">
    <div v-if="!fileInfo" class="text-muted-foreground">
      {{ t("该内容节点没有关联的文件") }}
    </div>
    <BlobView
      v-else
      :content-node-id="contentNodeId"
      :file-url="fileUrl"
      :file-name="fileInfo.fileName"
    />
  </div>
</template>
