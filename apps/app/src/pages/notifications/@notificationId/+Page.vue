<script setup lang="ts">
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
  Skeleton,
} from "@cat/ui";
import { ArrowLeft } from "@lucide/vue";
import { useQuery } from "@pinia/colada";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { computed, watch } from "vue";
import { useI18n } from "vue-i18n";

import Markdown from "@/components/Markdown.vue";
import { orpc } from "@/rpc/orpc";
import { useNotificationStore } from "@/stores/notification";
import { getCategoryLabel as _getCategoryLabel } from "@/utils/notification";

const { t } = useI18n();
const ctx = usePageContext();
const store = useNotificationStore();
const getCategoryLabel = (category: string) => _getCategoryLabel(t, category);

const notificationId = computed(() => Number(ctx.routeParams?.notificationId));

const { state } = useQuery({
  key: () => ["notification.getById", notificationId.value],
  query: () =>
    orpc.notification.getById({ notificationId: notificationId.value }),
  enabled: !import.meta.env.SSR,
});

watch(
  () => state.value.data,
  async (data) => {
    if (data && data.status === "UNREAD") {
      await store.markRead(data.id);
    }
  },
  { immediate: false },
);

const item = computed(() => state.value.data);
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <!-- 返回按钮 -->
    <Button
      variant="ghost"
      size="sm"
      class="w-fit"
      @click="navigate('/notifications')"
    >
      <ArrowLeft class="mr-2 h-4 w-4" />
      {{ t("返回收件箱") }}
    </Button>

    <!-- 加载骨架屏 -->
    <template v-if="state.status === 'pending'">
      <Skeleton class="h-8 w-1/2" />
      <Skeleton class="h-4 w-1/4" />
      <Skeleton class="h-40 w-full" />
    </template>

    <p v-else-if="!item" class="text-muted-foreground">
      {{ t("通知不存在或已被删除") }}
    </p>

    <!-- 消息内容 -->
    <Card v-else>
      <CardHeader class="space-y-2">
        <div class="flex items-center gap-2">
          <Badge variant="secondary">{{
            getCategoryLabel(item.category)
          }}</Badge>
          <time class="text-xs text-muted-foreground">
            {{ new Date(item.createdAt).toLocaleString() }}
          </time>
        </div>
        <CardTitle class="text-xl">{{ t(item.title) }}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent class="pt-4">
        <Markdown :content="item.body" />
      </CardContent>
    </Card>
  </div>
</template>
