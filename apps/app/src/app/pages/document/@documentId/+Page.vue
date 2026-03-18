<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { usePageContext } from "vike-vue/usePageContext";

import { BlobView } from "@/app/components/blob-view";

import type { Data } from "./+data.server";

const { fileInfo, fileUrl } = useData<Data>();
const pageContext = usePageContext();
// 从路由中提取 documentId
const documentId = pageContext.urlParsed.pathname.split("/").pop();
</script>

<template>
  <div class="p-6">
    <div v-if="!fileInfo" class="text-muted-foreground">
      {{ $t("该文档没有关联的文件") }}
    </div>
    <BlobView
      v-else
      :document-id="documentId"
      :file-url="fileUrl"
      :file-name="fileInfo.fileName"
    />
  </div>
</template>
