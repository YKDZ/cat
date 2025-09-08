<script setup lang="ts">
import { ref } from "vue";
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
import HButton from "./headless/HButton.vue";

const mouseInSidebar = ref<boolean>(false);

const ctx = usePageContext();

const { t } = useI18n();
const { isFree } = storeToRefs(useSidebarStore());

const { user } = usePageContext();

const items = ref([
  {
    path: "/",
    icon: "i-mdi:home",
    text: t("主页"),
  },
  {
    path: "/projects",
    icon: "i-mdi:folder",
    text: t("项目"),
  },
  {
    path: "/glossaries",
    icon: "i-mdi:file-word-box",
    text: t("术语"),
  },
  {
    path: "/memories",
    icon: "i-mdi:zip-box",
    text: t("记忆"),
  },
  {
    path: "/plugins",
    icon: "i-mdi:toy-brick",
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
            :icon="isFree ? 'i-mdi:card-outline' : 'i-mdi:card-off-outline'"
            @click="isFree = !isFree"
          />
        </div>
        <!-- Middle -->
        <div class="px-2 pt-6 flex flex-col gap-1 w-full">
          <HButton
            v-for="item in items"
            :key="item.path"
            :focused="ctx.urlParsed.pathname === item.path"
            :classes="{
              base: 'btn btn-lg btn-left btn-w-full btn-transparent',
              icon: 'btn-icon btn-icon-lg',
            }"
            :icon="item.icon"
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
