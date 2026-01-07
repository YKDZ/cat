<script setup lang="ts">
import ElemenContexts from "./ElemenContexts.vue";
import Comments from "@/app/components/Comments.vue";
import { SidebarHeader, SidebarRail } from "@/app/components/ui/sidebar";
import Sidebar from "@/app/components/ui/sidebar/Sidebar.vue";
import { useCookieStringRef } from "@/app/utils/cookie";
import { usePageContext } from "vike-vue/usePageContext";
import { useI18n } from "vue-i18n";
import { Tabs, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { useEditorTableStore } from "@/app/stores/editor/table";
import { storeToRefs } from "pinia";

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
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="context">{{ t("上下文") }}</TabsTrigger>
          <TabsTrigger value="discussion">{{ t("讨论") }}</TabsTrigger>
        </TabsList>
      </Tabs>
    </SidebarHeader>
    <ElemenContexts v-if="panelOpen === 'context'" />
    <Comments
      v-else-if="panelOpen === 'discussion'"
      :targetType="'ELEMENT'"
      :targetId="elementId!"
    />
    <SidebarRail :sidebarId="id" />
  </Sidebar>
</template>
