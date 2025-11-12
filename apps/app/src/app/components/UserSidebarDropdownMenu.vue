<script setup lang="ts">
import UserAvatar from "@/app/components/UserAvatar.vue";
import type { User } from "@cat/shared/schema/drizzle/user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";
import { ref } from "vue";
import { trpc } from "@cat/app-api/trpc/client";
import { useToastStore } from "@/app/stores/toast";
import { useSidebar } from "@/app/components/ui/sidebar";
import { Spinner } from "@/app/components/ui/spinner";

defineProps<{
  user: Pick<User, "id" | "name"> | null;
}>();

const { t } = useI18n();
const { info, trpcWarn } = useToastStore();
const { state } = useSidebar();

const isLoggingOut = ref(false);

const handleLogout = async () => {
  if (isLoggingOut.value) return;

  isLoggingOut.value = true;
  info(t("登出中..."));

  await trpc.auth.logout
    .mutate()
    .then(async () => {
      info(t("登出成功"));
      info(t("即将前往主界面..."));
      await navigate("/");
    })
    .catch(trpcWarn)
    .finally(() => (isLoggingOut.value = false));
};
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger class="w-full">
      <UserAvatar
        :with-name="state === 'expanded'"
        :user
        :size="state === 'collapsed' ? 16 : 24"
        class="w-full h-full hover:bg-background px-2 py-1 cursor-pointer"
      />
    </DropdownMenuTrigger>
    <DropdownMenuContent class="w-56">
      <DropdownMenuItem @click="navigate(`/admin`)">
        <div class="icon-[mdi--cog] size-4" />
        {{ t("管理") }}
      </DropdownMenuItem>
      <DropdownMenuItem @click="handleLogout">
        <Spinner v-if="isLoggingOut" />
        <div v-else class="icon-[mdi--logout] size-4" />
        {{ t("登出") }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
