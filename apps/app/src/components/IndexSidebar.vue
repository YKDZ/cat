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
} from "@lucide/vue";
import { usePageContext } from "vike-vue/usePageContext";
import { prefetch } from "vike/client/router";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import SidebarLogo from "@/components/SidebarLogo.vue";
import UserSidebarDropdownMenu from "@/components/UserSidebarDropdownMenu.vue";

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

const eagerPrefetchUrls = ["/projects"];

const prefetchSidebarRoutes = (index = 0) => {
  const url = eagerPrefetchUrls[index];

  if (!url) {
    return;
  }

  void prefetch(url)
    .catch(() => undefined)
    .finally(() => {
      window.setTimeout(() => prefetchSidebarRoutes(index + 1), 1200);
    });
};

onMounted(() => {
  window.setTimeout(prefetchSidebarRoutes, 600);
});
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
                <a
                  :href="item.url"
                  class="h-10"
                  data-prefetch-static-assets="viewport"
                >
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
