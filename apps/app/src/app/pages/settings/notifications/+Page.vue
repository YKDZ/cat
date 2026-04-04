<script setup lang="ts">
import {
  MessageCategoryValues,
  MessageChannelValues,
} from "@cat/shared/schema/enum";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Switch,
} from "@cat/ui";
import { useQuery } from "@pinia/colada";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/app/rpc/orpc";

const { t } = useI18n();


const { state, refetch } = useQuery({
  key: ["notification.preferences"],
  query: () => orpc.notification.getPreferences(),
  enabled: !import.meta.env.SSR,
});


const preferences = computed(() => state.value.data ?? []);


const isEnabled = (
  category: (typeof MessageCategoryValues)[number],
  channel: (typeof MessageChannelValues)[number],
) =>
  preferences.value.some(
    (p) => p.category === category && p.channel === channel && p.enabled,
  );


const togglePreference = async (
  category: (typeof MessageCategoryValues)[number],
  channel: (typeof MessageChannelValues)[number],
  enabled: boolean,
) => {
  await orpc.notification.updatePreference({ category, channel, enabled });
  refetch();
};


const categoryLabel = (cat: string) => {
  const map: Record<string, string> = {
    SYSTEM: t("系统通知"),
    COMMENT_REPLY: t("评论回复"),
    TRANSLATION: t("翻译通知"),
    PROJECT: t("项目通知"),
    QA: t("质检通知"),
  };
  return map[cat] ?? cat;
};


const channelLabel = (ch: string) => {
  const map: Record<string, string> = {
    IN_APP: t("站内信"),
    EMAIL: t("邮件"),
  };
  return map[ch] ?? ch;
};
</script>

<template>
  <div class="space-y-10 p-4">
    <div>
      <h2 class="text-2xl font-semibold">{{ t("通知设置") }}</h2>
      <p class="text-sm text-muted-foreground">
        {{ t("选择你希望通过哪些渠道接收各类通知") }}
      </p>
    </div>

    <template v-if="state.status === 'pending'">
      <Skeleton v-for="i in 5" :key="i" class="h-16 w-full" />
    </template>

    <div v-else class="flex flex-col gap-4">
      <Card v-for="category in MessageCategoryValues" :key="category">
        <CardHeader class="pb-2">
          <CardTitle class="text-base">{{ categoryLabel(category) }}</CardTitle>
          <CardDescription class="text-xs">
            {{ t("选择接收渠道") }}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex flex-wrap gap-6">
            <div
              v-for="channel in MessageChannelValues"
              :key="channel"
              class="flex items-center gap-2"
            >
              <Switch
                :checked="isEnabled(category, channel)"
                @update:checked="
                  (v: boolean) => togglePreference(category, channel, v)
                "
              />
              <span class="text-sm">{{ channelLabel(channel) }}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
