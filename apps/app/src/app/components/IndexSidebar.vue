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
import LogoutButton from "./LogoutButton.vue";

const mouseInSidebar = ref<boolean>(false);

const ctx = usePageContext();

const { isFree } = storeToRefs(useSidebarStore());

const { user } = usePageContext();
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
            :focused="ctx.urlParsed.pathname === `/`"
            full-width
            transparent
            left
            large
            icon="i-mdi:home"
            @click="navigate(`/`)"
            >主页</Button
          >
          <Button
            :focused="ctx.urlParsed.pathname === `/project`"
            left
            large
            full-width
            transparent
            icon="i-mdi:folder"
            @click="navigate(`/project`)"
            >项目</Button
          >
        </div>
      </div>
      <!-- Bottom -->
      <div class="px-4 pb-1 flex h-14 w-full items-center justify-between">
        <DropdownMenu>
          <template #trigger>
            <UserAvatar
              v-if="user"
              full-width
              button
              with-name
              size="32px"
              :user
            />
          </template>
          <template #content>
            <div class="flex flex-col">
              <LogoutButton />
            </div>
          </template>
        </DropdownMenu>
      </div>
    </div>
  </Sidebar>
</template>
