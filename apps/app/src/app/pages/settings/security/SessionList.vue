<script setup lang="ts">
import { Button } from "@cat/ui";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/app/rpc/orpc";
import { useToastStore } from "@/app/stores/toast";

const { t } = useI18n();
const { rpcWarn, info } = useToastStore();

type Session = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  expiresAt: string;
  createdAt: string;
  isCurrent: boolean;
};

const sessions = ref<Session[]>([]);

const load = async () => {
  sessions.value = await orpc.auth.listSessions();
};

const revoke = async (sessionId: string) => {
  await orpc.auth.revokeSession({ sessionId }).catch(rpcWarn);
  info(t("会话已撤销"));
  await load();
};

onMounted(load);
</script>

<template>
  <div class="space-y-2">
    <div v-if="sessions.length === 0" class="text-sm text-muted-foreground">
      {{ t("暂无活跃会话") }}
    </div>
    <div
      v-for="session in sessions"
      :key="session.id"
      class="flex items-center justify-between rounded-lg border p-3"
    >
      <div class="space-y-0.5">
        <div class="flex items-center gap-2 text-sm font-medium">
          <span>{{ session.ip ?? t("未知 IP") }}</span>
          <span
            v-if="session.isCurrent"
            class="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary"
          >
            {{ t("当前会话") }}
          </span>
        </div>
        <div class="text-xs text-muted-foreground">
          {{ session.userAgent ?? t("未知设备") }}
        </div>
        <div class="text-xs text-muted-foreground">
          {{ t("登录于") }} {{ new Date(session.createdAt).toLocaleString() }}
        </div>
      </div>
      <Button
        v-if="!session.isCurrent"
        variant="destructive"
        size="sm"
        @click="revoke(session.id)"
      >
        {{ t("撤销") }}
      </Button>
    </div>
  </div>
</template>
