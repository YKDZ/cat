<script setup lang="ts">
import { storeToRefs } from "pinia";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarFooter,
  SidebarMenuSkeleton,
} from "@/app/components/ui/sidebar";
import SidebarLogo from "@/app/components/SidebarLogo.vue";
import EditorSidebarElement from "./EditorSidebarElement.vue";
import EditorElementSearcher from "./EditorElementSearcher.vue";
import EditorSidebarPagination from "./EditorSidebarPagination.vue";
import { useEditorElementStore } from "@/app/stores/editor/element";
import { ScrollArea } from "@/app/components/ui/scroll-area";

const { displayedElements } = storeToRefs(useEditorElementStore());
</script>

<template>
  <Sidebar id="editor">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarLogo />
        </SidebarMenuItem>
        <SidebarMenuItem>
          <EditorElementSearcher />
        </SidebarMenuItem> </SidebarMenu
    ></SidebarHeader>
    <SidebarContent class="overflow-x-hidden">
      <ScrollArea class="w-full h-full">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu v-if="displayedElements.length > 0">
              <SidebarMenuItem
                v-for="element in displayedElements"
                :key="element.id"
              >
                <EditorSidebarElement :element />
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarMenu v-else>
              <SidebarMenuItem v-for="i in 16" :key="i">
                <SidebarMenuSkeleton :show-icon="true" />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </ScrollArea>
    </SidebarContent>
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <EditorSidebarPagination />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  </Sidebar>
</template>
