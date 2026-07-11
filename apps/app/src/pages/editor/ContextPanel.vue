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
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import Comments from "#/components/Comments.vue";
import { useEditorTableStore } from "#/stores/editor/table.ts";
import { useCookieStringRef } from "#/utils/cookie.ts";

import ElemenContexts from "./ElemenContexts.vue";
import ElementSourcePreview from "./ElementSourcePreview.vue";

const { t } = useI18n();

const panelOpenCookie = useCookieStringRef(
  usePageContext(),
  "editorContextPanelTab",
  "context",
);
const panelOpen = computed({
  get: () => panelOpenCookie.value ?? "context",
  set: (value: string) => {
    panelOpenCookie.value = value;
  },
});

const { elementId } = storeToRefs(useEditorTableStore());

const props = withDefaults(defineProps<{ id?: string }>(), {
  id: "editor-context-panel",
});
</script>

<template>
  <Sidebar :id="props.id">
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
    <SidebarRail :sidebar-id="props.id" />
  </Sidebar>
</template>
