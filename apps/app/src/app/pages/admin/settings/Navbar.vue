<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/app/components/ui/navigation-menu";
import { usePageContext } from "vike-vue/usePageContext";
import { Server } from "lucide-vue-next";

const ctx = usePageContext();
const { t } = useI18n();

const items = ref([
  {
    icon: Server,
    title: t("基本"),
    href: "",
  },
]);
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
