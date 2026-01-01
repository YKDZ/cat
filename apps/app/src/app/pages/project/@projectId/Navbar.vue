<script setup lang="ts">
import { useI18n } from "vue-i18n";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/app/components/ui/navigation-menu";
import type { Project } from "@cat/shared/schema/drizzle/project";
import {
  Archive,
  Book,
  Box,
  Home,
  NotebookText,
  Settings,
} from "lucide-vue-next";
import type { Component } from "vue";
import NavigationMenuIndicator from "@/app/components/ui/navigation-menu/NavigationMenuIndicator.vue";
import { usePageContext } from "vike-vue/usePageContext";

const props = defineProps<{
  project: Pick<Project, "id">;
}>();

const { t } = useI18n();
const ctx = usePageContext();

const items: { title: string; href: string; icon: Component }[] = [
  {
    title: t("主页"),
    icon: Home,
    href: `/project/${props.project.id}`,
  },
  {
    title: t("文档"),
    icon: Book,
    href: `/project/${props.project.id}/documents`,
  },
  {
    title: t("记忆"),
    icon: Box,
    href: `/project/${props.project.id}/memories`,
  },
  {
    title: t("术语"),
    icon: Archive,
    href: `/project/${props.project.id}/glossaries`,
  },
  {
    title: t("任务"),
    icon: NotebookText,
    href: `/project/${props.project.id}/tasks`,
  },
  {
    title: t("设置"),
    icon: Settings,
    href: `/project/${props.project.id}/settings`,
  },
];
</script>

<template>
  <NavigationMenu>
    <NavigationMenuList>
      <NavigationMenuItem>
        <NavigationMenuLink
          v-for="item in items"
          :key="item.title"
          :href="item.href"
          :class="navigationMenuTriggerStyle()"
          :active="item.href === ctx.urlPathname"
        >
          <div class="flex gap-1 items-center">
            <component :is="item.icon" />
            {{ item.title }}
          </div>
        </NavigationMenuLink>
      </NavigationMenuItem>
    </NavigationMenuList>
    <NavigationMenuIndicator />
  </NavigationMenu>
</template>
