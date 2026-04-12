<script setup lang="ts">
import { Button, ScrollArea } from "@cat/ui";
import { Clock, Plus } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { watch } from "vue";
import { useI18n } from "vue-i18n";

import { useAgentStore } from "@/app/stores/agent";

const props = defineProps<{
  projectId: string;
}>();

const emit = defineEmits<{
  newSession: [];
}>();

const { t } = useI18n();
const agentStore = useAgentStore();
const { sessions, activeSessionId } = storeToRefs(agentStore);

const formatDate = (date: Date) => {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    ACTIVE: t("进行中"),
    COMPLETED: t("已完成"),
    ERROR: t("错误"),
    PAUSED: t("已暂停"),
  };
  return map[status] ?? status;
};

const statusClass = (status: string) => {
  if (status === "ACTIVE")
    return "bg-green-500/20 text-green-700 dark:text-green-400";
  if (status === "ERROR") return "bg-red-500/20 text-red-700 dark:text-red-400";
  if (status === "PAUSED")
    return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400";
  return "bg-muted text-muted-foreground";
};

watch(
  () => props.projectId,
  (projectId) => {
    void agentStore.fetchSessions({ projectId });
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex h-full flex-col border-r bg-muted/20">
    <!-- Header -->
    <div class="flex items-center justify-between border-b px-3 py-2">
      <span class="text-xs font-medium text-muted-foreground">{{
        t("历史会话")
      }}</span>
      <Button
        size="icon-sm"
        variant="ghost"
        :title="t('新建会话')"
        @click="emit('newSession')"
      >
        <Plus class="size-3.5" />
      </Button>
    </div>

    <!-- Session list -->
    <ScrollArea class="min-h-0 flex-1">
      <div class="flex flex-col gap-1 p-2">
        <div
          v-if="sessions.length === 0"
          class="py-6 text-center text-xs text-muted-foreground"
        >
          {{ t("暂无会话") }}
        </div>
        <button
          v-for="session in sessions"
          :key="session.id"
          class="flex flex-col gap-1 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-muted/60"
          :class="
            session.id === activeSessionId ? 'bg-muted ring-1 ring-border' : ''
          "
          @click="void agentStore.switchSession(session.id)"
        >
          <div class="flex items-center gap-1.5">
            <span
              class="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              :class="statusClass(session.status)"
            >
              {{ statusLabel(session.status) }}
            </span>
            <span
              class="ml-auto truncate font-mono text-[10px] text-muted-foreground/60"
            >
              {{ session.id.slice(0, 8) }}
            </span>
          </div>
          <div class="flex items-center gap-1 text-muted-foreground">
            <Clock class="size-2.5 shrink-0" />
            <span class="truncate text-[10px]">{{
              formatDate(session.createdAt)
            }}</span>
          </div>
        </button>
      </div>
    </ScrollArea>
  </div>
</template>
