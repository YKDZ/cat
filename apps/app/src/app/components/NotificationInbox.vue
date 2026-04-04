<script setup lang="ts">
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Separator,
} from "@cat/ui";
import { Bell } from "@lucide/vue";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";

import { useNotificationStore } from "@/app/stores/notification";

const { t } = useI18n();
const store = useNotificationStore();

const handleMarkAllRead = async () => {
  await store.markAllRead();
};

const handleClickItem = async (id: number) => {
  await store.markRead(id);
  navigate(`/notifications/${id}`);
};
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="ghost" size="icon" class="relative" :title="t('通知')">
        <Bell class="h-5 w-5" />
        <Badge
          v-if="store.unreadCount > 0"
          variant="destructive"
          class="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]"
        >
          {{ store.unreadCount > 99 ? "99+" : store.unreadCount }}
        </Badge>
      </Button>
    </PopoverTrigger>

    <PopoverContent class="w-80 p-0" align="end">
      <!-- 浮层头部 -->
      <div class="flex items-center justify-between px-4 py-3">
        <span class="text-sm font-semibold">{{ t("通知") }}</span>
        <Button
          v-if="store.unreadCount > 0"
          variant="ghost"
          size="sm"
          class="h-7 text-xs"
          @click="handleMarkAllRead"
        >
          {{ t("全部标为已读") }}
        </Button>
      </div>

      <Separator />

      <!-- 通知列表 -->
      <ScrollArea class="h-80">
        <div
          v-if="store.recentNotifications.length === 0"
          class="flex h-full items-center justify-center py-10 text-sm text-muted-foreground"
        >
          {{ t("暂无通知") }}
        </div>

        <div
          v-for="item in store.recentNotifications"
          :key="item.id"
          class="flex cursor-pointer flex-col gap-1 px-4 py-3 hover:bg-muted/50"
          :class="{ 'opacity-60': item.status !== 'UNREAD' }"
          @click="handleClickItem(item.id)"
        >
          <div class="flex items-start justify-between gap-2">
            <span class="line-clamp-1 text-sm font-medium">{{
              t(item.title)
            }}</span>
            <span
              v-if="item.status === 'UNREAD'"
              class="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary"
            />
          </div>
          <p class="line-clamp-2 text-xs text-muted-foreground">
            {{ t(item.body) }}
          </p>
        </div>
      </ScrollArea>

      <Separator />

      <!-- 底部查看全部 -->
      <div class="px-4 py-2 text-center">
        <Button
          variant="ghost"
          size="sm"
          class="w-full text-xs"
          @click="navigate('/notifications')"
        >
          {{ t("查看全部通知") }}
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
