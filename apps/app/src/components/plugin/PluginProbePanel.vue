<script setup lang="ts">
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@cat/ui";
import { TestTube2, XCircle } from "@lucide/vue";
import { useI18n } from "vue-i18n";

import type { NonNullPluginDetail, PluginProbeResult } from "./types";

const { t } = useI18n();

/**
 * Props for the plugin probe panel.
 */
defineProps<{
  /** Plugin detail read model. */
  detail: NonNullPluginDetail;
  /** Latest probe result. */
  result: PluginProbeResult | null;
  /** Whether a probe request is in progress. */
  isProbing: boolean;
}>();

/**
 * Events emitted by the plugin probe panel.
 */
const emit = defineEmits<{
  /** Probe the currently applied runtime config. */
  probeRuntime: [];
  /** Cancel the in-flight probe request. */
  cancelProbe: [];
}>();
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ t("配置检测") }}</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="space-y-2 text-sm text-muted-foreground">
        <p>{{ t("检测是显式操作，不会在输入时自动触发。") }}</p>
        <p
          v-if="
            detail.capabilities.services.some(
              (service) => service.probeBillable,
            )
          "
        >
          {{
            t("部分检测会调用外部服务，可能消耗配额；系统会使用最小样例输入。")
          }}
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <Badge
          v-for="service in detail.capabilities.services"
          :key="`${service.source}:${service.serviceType}:${service.serviceId}`"
          variant="secondary"
        >
          {{ service.serviceType }} · {{ service.serviceId }}
          <span v-if="!service.supportsProbe">({{ t("不支持检测") }})</span>
        </Badge>
      </div>

      <div class="flex flex-wrap gap-2">
        <Button
          variant="outline"
          :disabled="isProbing || !detail.actions.canProbeRuntime"
          @click="emit('probeRuntime')"
        >
          <TestTube2 class="mr-2 size-4" />
          {{ isProbing ? t("检测中…") : t("检测当前运行配置") }}
        </Button>
        <Button v-if="isProbing" variant="ghost" @click="emit('cancelProbe')">
          <XCircle class="mr-2 size-4" />
          {{ t("取消检测") }}
        </Button>
      </div>

      <div v-if="result" class="space-y-3">
        <div class="text-sm font-medium">
          {{ t("检测结果：{status}", { status: t(result.overallStatus) }) }}
        </div>
        <div
          v-for="item in result.results"
          :key="`${item.serviceType}:${item.serviceId}`"
          class="rounded-md border p-3 text-sm"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium"
              >{{ item.serviceType }} · {{ item.serviceId }}</span
            >
            <Badge variant="secondary">{{ t(item.status) }}</Badge>
            <span v-if="item.latencyMs !== null" class="text-muted-foreground">
              {{ t("{latency} ms", { latency: item.latencyMs }) }}
            </span>
          </div>
          <pre class="mt-2 overflow-auto rounded bg-muted p-2 text-xs">{{
            JSON.stringify(item.summary, null, 2)
          }}</pre>
          <p
            v-for="warning in item.warnings"
            :key="warning"
            class="mt-2 text-xs text-muted-foreground"
          >
            {{ t(warning) }}
          </p>
          <p v-if="item.error" class="mt-2 text-xs text-destructive">
            {{ t(item.error.message) }}
          </p>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
