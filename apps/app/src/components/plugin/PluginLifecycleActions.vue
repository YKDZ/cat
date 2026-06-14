<script setup lang="ts">
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@cat/ui";
import { Download, RefreshCw, Trash2 } from "@lucide/vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import type { NonNullPluginDetail } from "./types";

const { t } = useI18n();

/**
 * Props for the plugin lifecycle actions panel.
 */
defineProps<{
  /** Plugin detail read model. */
  detail: NonNullPluginDetail;
  /** Whether a lifecycle action is in progress. */
  isBusy: boolean;
}>();

/**
 * Events emitted by the plugin lifecycle actions panel.
 */
const emit = defineEmits<{
  /** Install the plugin into the current scope. */
  install: [];
  /** Uninstall the plugin from the current scope. */
  uninstall: [];
  /** Reload the current plugin runtime. */
  reload: [];
}>();

const confirmingUninstall = ref(false);
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ t("生命周期") }}</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="flex flex-wrap gap-2 text-sm">
        <Badge variant="secondary">{{
          detail.isInstalled ? t("已安装") : t("未安装")
        }}</Badge>
        <Badge variant="secondary">{{ t(detail.runtimeStatus) }}</Badge>
      </div>

      <div class="flex flex-wrap gap-2">
        <Button
          v-if="detail.actions.canInstall"
          :disabled="isBusy"
          @click="emit('install')"
        >
          <Download class="mr-2 size-4" />
          {{ t("安装") }}
        </Button>
        <Button
          v-if="detail.actions.canReload"
          variant="outline"
          :disabled="isBusy"
          @click="emit('reload')"
        >
          <RefreshCw class="mr-2 size-4" />
          {{ detail.actions.canRetryApply ? t("重试应用") : t("重载") }}
        </Button>
        <Button
          v-if="detail.actions.canUninstall && !confirmingUninstall"
          variant="destructive"
          :disabled="isBusy"
          @click="confirmingUninstall = true"
        >
          <Trash2 class="mr-2 size-4" />
          {{ t("卸载") }}
        </Button>
      </div>

      <div
        v-if="detail.runtimeStatus === 'DEGRADED' && detail.runtime.lastError"
        class="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
      >
        <p>{{ t(detail.runtime.lastError) }}</p>
        <p class="mt-1">{{ t("请重试应用或手动重载；必要时重启服务。") }}</p>
      </div>

      <div
        v-if="confirmingUninstall"
        class="rounded-md border border-destructive/40 p-3 text-sm"
      >
        <p class="mb-3">
          {{ t("确认从当前作用域卸载此插件？配置实例也会被删除。") }}
        </p>
        <div class="flex gap-2">
          <Button
            variant="destructive"
            :disabled="isBusy"
            @click="emit('uninstall')"
          >
            {{ t("确认卸载") }}
          </Button>
          <Button
            variant="outline"
            :disabled="isBusy"
            @click="confirmingUninstall = false"
          >
            {{ t("取消") }}
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
