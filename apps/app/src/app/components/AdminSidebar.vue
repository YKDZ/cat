<script setup lang="ts">
import { ref } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import UserSidebarDropdownMenu from "@/app/components/UserSidebarDropdownMenu.vue";
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
} from "@/app/components/ui/sidebar";
import SidebarLogo from "@/app/components/SidebarLogo.vue";
import { AppWindow, Settings, BrickWall } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const { user } = usePageContext();

const items = ref([
  {
    url: "/admin",
    icon: AppWindow,
    title: t("首页"),
  },
  {
    url: "/admin/settings",
    icon: Settings,
    title: t("参数设置"),
  },
  {
    url: "/admin/plugins",
    icon: BrickWall,
    title: t("插件"),
  },
]);
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarLogo />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in items" :key="item.title">
              <SidebarMenuButton asChild>
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
          <UserSidebarDropdownMenu :user />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  </Sidebar>
</template>
