<script setup lang="ts">
import {
  Sidebar,
  SidebarHeader,
  SidebarRail,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@cat/ui";
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { useI18n } from "vue-i18n";

import Comments from "@/components/Comments.vue";
import { useEditorTableStore } from "@/stores/editor/table";
import { useCookieStringRef } from "@/utils/cookie";

import ElemenContexts from "./ElemenContexts.vue";
import ElementSourcePreview from "./ElementSourcePreview.vue";

const { t } = useI18n();

const panelOpen = useCookieStringRef(
  usePageContext(),
  "editorContextPanelTab",
  "context",
);

const { elementId } = storeToRefs(useEditorTableStore());

const id = "editor-context-panel";
</script>

<template>
  <Sidebar :id>
    <SidebarHeader>
      <Tabs v-model="panelOpen">
        <TabsList class="grid w-full grid-cols-3">
          <TabsTrigger value="context">{{ t("上下文") }}</TabsTrigger>
          <TabsTrigger value="source">{{ t("源文件") }}</TabsTrigger>
          <TabsTrigger value="discussion">{{ t("讨论") }}</TabsTrigger>
        </TabsList>
      </Tabs>
    </SidebarHeader>
    <ElemenContexts v-if="panelOpen === 'context'" />
    <ElementSourcePreview v-else-if="panelOpen === 'source'" />
    <Comments
      v-else-if="panelOpen === 'discussion'"
      :targetType="'ELEMENT'"
      :targetId="elementId!"
    />
    <SidebarRail :sidebarId="id" />
  </Sidebar>
</template>
