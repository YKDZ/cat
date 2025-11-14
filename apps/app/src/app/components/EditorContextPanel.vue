<script setup lang="ts">
import EditorElemenContexts from "@/app/components/EditorElemenContexts.vue";
import EditorElementComments from "@/app/components/EditorElementComments.vue";
import Sidebar from "@/app/components/ui/sidebar/Sidebar.vue";
import SidebarContent from "@/app/components/ui/sidebar/SidebarContent.vue";
import SidebarGroup from "@/app/components/ui/sidebar/SidebarGroup.vue";
import SidebarGroupContent from "@/app/components/ui/sidebar/SidebarGroupContent.vue";
import SidebarHeader from "@/app/components/ui/sidebar/SidebarHeader.vue";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/app/components/ui/tabs";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <Sidebar side="right" id="editor-context-panel" width="24rem">
    <Tabs default-value="context">
      <SidebarHeader>
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="context"> {{ t("上下文") }} </TabsTrigger>
          <TabsTrigger value="discussion"> {{ t("讨论") }} </TabsTrigger>
        </TabsList>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <TabsContent value="context">
              <EditorElemenContexts />
            </TabsContent>
            <TabsContent value="discussion">
              <EditorElementComments />
            </TabsContent>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Tabs>
  </Sidebar>
</template>
