<script setup lang="ts">
import { ref } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import Logo from "./Logo.vue";
import DropdownMenu from "./dropdown/DropdownMenu.vue";
import LogoutBtn from "./LogoutBtn.vue";
import AdminBtn from "./AdminBtn.vue";
import UserAvatar from "./UserAvatar.vue";
import Sidebar from "./Sidebar.vue";
import HButton from "./headless/HButton.vue";
import { useSidebarStore } from "@/app/stores/sidebar.ts";

const mouseInSidebar = ref<boolean>(false);

const ctx = usePageContext();

const { t } = useI18n();

const { isFree } = storeToRefs(useSidebarStore());

const { user } = usePageContext();

const items = ref([
  {
    path: "/admin",
    icon: "icon-[mdi--home]",
    text: t("首页"),
  },
  {
    path: "/admin/settings",
    icon: "icon-[mdi--folder]",
    text: t("参数设置"),
  },
  {
    path: "/admin/plugins",
    icon: "icon-[mdi--toy-brick]",
    text: t("插件"),
  },
]);

const handleNavigate = async (path: string) => {
  await navigate(path);
};
</script>

<template>
  <Sidebar v-model:mouse-in-sidebar="mouseInSidebar">
    <div class="flex flex-col h-full w-full justify-between">
      <div class="flex flex-col items-center">
        <div
          class="px-4.5 pt-5 flex gap-1 h-fit w-full select-none items-center justify-between"
        >
          <Logo link />
          <HButton
            class="hidden md:flex"
            :classes="{
              base: 'btn btn-md btn-transparent btn-square',
              icon: 'btn-icon',
            }"
            :icon="
              isFree
                ? 'icon-[mdi--card-outline]'
                : 'icon-[mdi--card-off-outline]'
            "
            @click="isFree = !isFree"
          />
        </div>
        <!-- Middle -->
        <div class="px-2 pt-6 flex flex-col gap-1 w-full">
          <HButton
            v-for="item in items"
            :key="item.path"
            :focused="ctx.urlParsed.pathname === item.path"
            :icon="item.icon"
            :classes="{
              base: 'btn btn-md btn-transparent btn-w-full',
              icon: 'btn-icon btn-icon-md',
            }"
            @click="handleNavigate(item.path)"
          >
            {{ item.text }}
          </HButton>
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
