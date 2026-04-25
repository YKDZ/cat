<script setup lang="ts">
import type { Project } from "@cat/shared";
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
  GitPullRequest,
  Home,
  MessageSquare,
  NotebookText,
  Settings,
  TriangleAlert,
  Workflow,
} from "@lucide/vue";
import { usePageContext } from "vike-vue/usePageContext";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  project: Pick<Project, "id" | "features">;
}>();

const { t } = useI18n();
const ctx = usePageContext();

const items = computed(() => {
  const base: { title: string; href: string; icon: Component }[] = [
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
  ];

  if (props.project.features?.issues) {
    base.push({
      title: t("议题"),
      icon: TriangleAlert,
      href: `/project/${props.project.id}/issues`,
    });
  }

  if (props.project.features?.pullRequests) {
    base.push({
      title: t("拉取请求"),
      icon: GitPullRequest,
      href: `/project/${props.project.id}/pull-requests`,
    });
  }

  base.push(
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
  );

  return base;
});
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
