<script setup lang="ts">
import type { NotificationStatus } from "@cat/shared";

import {
  Badge,
  Button,
  Card,
  CardContent,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
  Skeleton,
} from "@cat/ui";
import { useQuery } from "@pinia/colada";
import { navigate } from "vike/client/router";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/rpc/orpc";
import { useNotificationStore } from "@/stores/notification";
import { getCategoryLabel as _getCategoryLabel } from "@/utils/notification";

const { t } = useI18n();
const store = useNotificationStore();
const getCategoryLabel = (category: string) => _getCategoryLabel(t, category);

const pageIndex = ref(0);
const pageSize = 20;
const statusFilter = ref<NotificationStatus | undefined>(undefined);

const { state, refetch } = useQuery({
  key: () => [
    "notification.list",
    pageIndex.value,
    statusFilter.value ?? "ALL",
  ],
  query: () =>
    orpc.notification.list({
      pageIndex: pageIndex.value,
      pageSize,
      statusFilter: statusFilter.value,
    }),
  enabled: !import.meta.env.SSR,
});

const notifications = computed(() => state.value.data ?? []);

const statusOptions: {
  label: string;
  value: NotificationStatus | undefined;
}[] = [
  { label: t("全部"), value: undefined },
  { label: t("未读"), value: "UNREAD" },
  { label: t("已读"), value: "READ" },
];

const handleMarkAllRead = async () => {
  await store.markAllRead();
  refetch();
};
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <!-- 页头 -->
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">{{ t("通知") }}</h1>
      <Button
        v-if="store.unreadCount > 0"
        variant="outline"
        size="sm"
        @click="handleMarkAllRead"
      >
        {{ t("全部标为已读") }}
      </Button>
    </div>

    <!-- 过滤选项卡 -->
    <div class="flex gap-2">
      <Button
        v-for="opt in statusOptions"
        :key="opt.label"
        :variant="statusFilter === opt.value ? 'default' : 'ghost'"
        size="sm"
        @click="
          statusFilter = opt.value;
          pageIndex = 0;
        "
      >
        {{ opt.label }}
      </Button>
    </div>

    <!-- 通知列表 -->
    <div class="flex flex-col gap-2">
      <template v-if="state.status === 'pending'">
        <Skeleton v-for="i in 5" :key="i" class="h-16 w-full rounded-md" />
      </template>

      <p
        v-else-if="notifications.length === 0"
        class="py-10 text-center text-muted-foreground"
      >
        {{ t("暂无通知") }}
      </p>

      <Card
        v-else
        v-for="item in notifications"
        :key="item.id"
        class="cursor-pointer transition-colors hover:bg-muted/50"
        :class="{ 'opacity-70': item.status !== 'UNREAD' }"
        @click="navigate(`/notifications/${item.id}`)"
      >
        <CardContent class="flex items-start gap-3 p-3">
          <span
            v-if="item.status === 'UNREAD'"
            class="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary"
          />
          <span v-else class="mt-2 h-2 w-2 shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <Badge variant="secondary" class="shrink-0 text-xs">
                {{ getCategoryLabel(item.category) }}
              </Badge>
              <span class="truncate text-sm font-medium">{{
                t(item.title)
              }}</span>
            </div>
            <p class="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {{ item.body }}
            </p>
          </div>
          <time class="shrink-0 text-xs text-muted-foreground">
            {{ new Date(item.createdAt).toLocaleDateString() }}
          </time>
        </CardContent>
      </Card>
    </div>

    <!-- 分页 -->
    <Pagination
      v-if="notifications.length === pageSize || pageIndex > 0"
      :page="pageIndex + 1"
      @update:page="
        (p: number) => {
          pageIndex = p - 1;
        }
      "
    >
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious :disabled="pageIndex === 0" />
        </PaginationItem>
        <PaginationItem>
          <PaginationNext :disabled="notifications.length < pageSize" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  </div>
</template>
