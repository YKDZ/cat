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
  SidebarRail,
} from "@/app/components/ui/sidebar";
import SidebarLogo from "@/app/components/SidebarLogo.vue";
import SidebarElement from "./SidebarElement.vue";
import ElementSearcher from "./ElementSearcher.vue";
import SidebarPagination from "./SidebarPagination.vue";
import { useEditorElementStore } from "@/app/stores/editor/element";
import { ScrollArea } from "@/app/components/ui/scroll-area";

const { displayedElements } = storeToRefs(useEditorElementStore());

const sidebarId = "editor";
</script>

<template>
  <Sidebar :id="sidebarId">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarLogo :sidebarId="sidebarId" />
        </SidebarMenuItem>
        <SidebarMenuItem>
          <ElementSearcher />
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
                <SidebarElement :element />
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
          <SidebarPagination />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
    <SidebarRail :sidebarId="sidebarId" />
  </Sidebar>
</template>
