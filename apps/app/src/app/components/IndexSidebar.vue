<script setup lang="ts">
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@cat/ui";
import {
  Home,
  BrickWall,
  Box,
  Bell,
  Folder,
  Archive,
  ShieldCheck,
} from "lucide-vue-next";
import { usePageContext } from "vike-vue/usePageContext";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import SidebarLogo from "@/app/components/SidebarLogo.vue";
import UserSidebarDropdownMenu from "@/app/components/UserSidebarDropdownMenu.vue";

const { t } = useI18n();


const { user } = usePageContext();


const sidebarId = "index";


const items = ref([
  {
    url: "/",
    icon: Home,
    title: t("主页"),
  },
  {
    url: "/projects",
    icon: Folder,
    title: t("项目"),
  },
  {
    url: "/glossaries",
    icon: Archive,
    title: t("术语"),
  },
  {
    url: "/memories",
    icon: Box,
    title: t("记忆"),
  },
  {
    url: "/plugins",
    icon: BrickWall,
    title: t("插件"),
  },
  {
    url: "/settings/security",
    icon: ShieldCheck,
    title: t("安全"),
  },
  {
    url: "/settings/notifications",
    icon: Bell,
    title: t("通知设置"),
  },
]);
</script>

<template>
  <Sidebar :id="sidebarId" collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarLogo :sidebarId />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in items" :key="item.title">
              <SidebarMenuButton :sidebarId asChild>
                <a :href="item.url" class="h-10">
                  <component :is="item.icon" />
                  <span>{{ item.title }}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <UserSidebarDropdownMenu :sidebarId :user />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  </Sidebar>
</template>
