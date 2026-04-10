<script setup lang="ts">
import type { Project } from "@cat/shared/schema/drizzle/project";
import type { Component } from "vue";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@cat/ui";
import {
  Archive,
  Book,
  Bot,
  Box,
  Home,
  LayoutGrid,
  MessageSquare,
  NotebookText,
  Settings,
  Workflow,
} from "@lucide/vue";
import { usePageContext } from "vike-vue/usePageContext";
import { useI18n } from "vue-i18n";

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
    title: t("工作流"),
    icon: Workflow,
    href: `/project/${props.project.id}/workflows`,
  },
  {
    title: t("看板"),
    icon: LayoutGrid,
    href: `/project/${props.project.id}/kanban`,
  },
  {
    title: t("Agent"),
    icon: Bot,
    href: `/project/${props.project.id}/agents`,
  },
  {
    title: t("Agent 对话"),
    icon: MessageSquare,
    href: `/project/${props.project.id}/agent-chat`,
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
          <div class="flex items-center gap-1">
            <component :is="item.icon" />
            {{ item.title }}
          </div>
        </NavigationMenuLink>
      </NavigationMenuItem>
    </NavigationMenuList>
    <NavigationMenuIndicator />
  </NavigationMenu>
</template>
