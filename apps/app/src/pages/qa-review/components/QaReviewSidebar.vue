<script setup lang="ts">
import {
  SidebarMenuItem,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
} from "@cat/ui";
import { ScrollArea } from "@cat/ui";

import SidebarLogo from "@/components/SidebarLogo.vue";

import QaReviewSidebarElement from "./QaReviewSidebarElement.vue";
import QaReviewSidebarPagination from "./QaReviewSidebarPagination.vue";

const sidebarId = "editor";
</script>

<template>
  <Sidebar :id="sidebarId">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarLogo :sidebarId="sidebarId" />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent class="overflow-x-hidden">
      <ScrollArea class="h-full w-full">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <QaReviewSidebarElement />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </ScrollArea>
    </SidebarContent>
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <QaReviewSidebarPagination />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
    <SidebarRail :sidebarId="sidebarId" />
  </Sidebar>
</template>
