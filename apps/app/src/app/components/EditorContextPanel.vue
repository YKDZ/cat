<script setup lang="ts">
import EditorElemenContexts from "@/app/components/EditorElemenContexts.vue";
import EditorElementComments from "@/app/components/EditorElementComments.vue";
import { SidebarHeader, SidebarRail } from "@/app/components/ui/sidebar";
import Sidebar from "@/app/components/ui/sidebar/Sidebar.vue";
import { useCookieStringRef } from "@/app/utils/cookie";
import { usePageContext } from "vike-vue/usePageContext";
import { useI18n } from "vue-i18n";
import { Tabs, TabsList, TabsTrigger } from "@/app/components/ui/tabs";

const { t } = useI18n();

const panelOpen = useCookieStringRef(
  usePageContext(),
  "editorContextPanelTab",
  "context",
);

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
    <EditorElemenContexts v-if="panelOpen === 'context'" />
    <EditorElementComments v-else-if="panelOpen === 'discussion'" />
    <SidebarRail :sidebarId="id" />
  </Sidebar>
</template>
