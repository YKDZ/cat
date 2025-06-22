<script setup lang="ts">
import { ref } from "vue";
import Button from "./Button.vue";
import Sidebar from "./Sidebar.vue";
import UserAvatar from "./UserAvatar.vue";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { storeToRefs } from "pinia";
import { useSidebarStore } from "../stores/sidebar";
import Logo from "./Logo.vue";
import DropdownMenu from "./dropdown/DropdownMenu.vue";
import LogoutBtn from "./LogoutBtn.vue";
import AdminBtn from "./AdminBtn.vue";
import { useI18n } from "vue-i18n";

const mouseInSidebar = ref<boolean>(false);

const ctx = usePageContext();

const { t } = useI18n();

const { isFree } = storeToRefs(useSidebarStore());

const { user } = usePageContext();

const items = ref([
  {
    path: "/admin",
    icon: "i-mdi:home",
    text: t("首页"),
  },
  {
    path: "/admin/settings",
    icon: "i-mdi:folder",
    text: t("参数设置"),
  },
  {
    path: "/admin/plugins",
    icon: "i-mdi:toy-brick",
    text: t("插件"),
  },
]);
</script>

<template>
  <Sidebar v-model:mouse-in-sidebar="mouseInSidebar">
    <div class="flex flex-col h-full w-full justify-between">
      <div class="flex flex-col items-center">
        <div
          class="px-4.5 pt-5 flex gap-1 h-fit w-full select-none items-center justify-between"
        >
          <Logo link />
          <Button
            transparent
            no-text
            :icon="isFree ? 'i-mdi:card-outline' : 'i-mdi:card-off-outline'"
            class="hidden md:flex"
            @click="isFree = !isFree"
          />
        </div>
        <!-- Middle -->
        <div class="px-2 pt-6 flex flex-col gap-1 w-full">
          <Button
            v-for="item in items"
            :key="item.path"
            :focused="ctx.urlParsed.pathname === item.path"
            full-width
            transparent
            left
            :icon="item.icon"
            @click="navigate(item.path)"
          >
            {{ item.text }}
          </Button>
        </div>
      </div>
      <!-- Bottom -->
      <div class="px-4 pb-1 flex h-14 w-full items-center justify-between">
        <DropdownMenu>
          <template #trigger>
            <UserAvatar
              v-if="user"
              class="px-2 py-1 rounded-sm cursor-pointer hover:bg-highlight-darkest"
              full-width
              with-name
              :size="32"
              :user
            />
          </template>
          <template #content>
            <div class="flex flex-col">
              <AdminBtn />
              <LogoutBtn />
            </div>
          </template>
        </DropdownMenu>
      </div>
    </div>
  </Sidebar>
</template>
