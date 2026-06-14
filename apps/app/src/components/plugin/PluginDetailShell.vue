<script setup lang="ts">
import type { NonNullJSONType } from "@cat/shared";

import { Badge, Card, CardContent, CardHeader, CardTitle } from "@cat/ui";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import type { NonNullPluginDetail, PluginProbeResult } from "./types";

import PluginConfigEditor from "./PluginConfigEditor.vue";
import PluginLifecycleActions from "./PluginLifecycleActions.vue";
import PluginProbePanel from "./PluginProbePanel.vue";

const { t } = useI18n();

/**
 * Props for the plugin detail shell component.
 */
const props = defineProps<{
  /** Plugin detail read model. */
  detail: NonNullPluginDetail;
  /** Latest probe result. */
  probeResult: PluginProbeResult | null;
  /** Whether a lifecycle action is in progress. */
  isBusy: boolean;
  /** Whether a save request is in progress. */
  isSaving: boolean;
  /** Whether a probe request is in progress. */
  isProbing: boolean;
}>();

/**
 * Events emitted by the plugin detail shell component.
 */
const emit = defineEmits<{
  /** Install the plugin. */
  install: [];
  /** Uninstall the plugin. */
  uninstall: [];
  /** Reload the plugin. */
  reload: [];
  /** Save plugin configuration. */
  saveConfig: [value: NonNullJSONType, expectedUpdatedAt: string | null];
  /** Probe candidate configuration. */
  probeCandidate: [value: NonNullJSONType];
  /** Probe the current runtime configuration. */
  probeRuntime: [];
  /** Cancel the running probe. */
  cancelProbe: [];
}>();

const simpleName = computed(() =>
  props.detail.plugin.name.replace("@cat-plugin/", ""),
);
</script>

<template>
  <div class="space-y-4">
    <Card>
      <CardHeader>
        <div
          class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
        >
          <div>
            <CardTitle>{{ simpleName }}</CardTitle>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ detail.plugin.id }} · {{ detail.plugin.version }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <Badge variant="secondary">{{
              detail.plugin.isExternal ? t("外部插件") : t("内部插件")
            }}</Badge>
            <Badge variant="secondary">{{
              detail.config.hasConfig ? t("有配置") : t("无配置")
            }}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent class="space-y-3">
        <p
          v-if="detail.plugin.overview"
          class="text-sm whitespace-pre-wrap text-muted-foreground"
        >
          {{ detail.plugin.overview }}
        </p>
        <p v-if="detail.manifestError" class="text-sm text-destructive">
          {{
            t("Manifest 读取失败：{message}", { message: detail.manifestError })
          }}
        </p>
      </CardContent>
    </Card>

    <PluginLifecycleActions
      :detail="detail"
      :is-busy="isBusy"
      @install="emit('install')"
      @uninstall="emit('uninstall')"
      @reload="emit('reload')"
    />

    <Card>
      <CardHeader>
        <CardTitle>{{ t("能力") }}</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div class="flex flex-wrap gap-2">
          <Badge
            v-for="service in detail.capabilities.services"
            :key="`${service.source}:${service.serviceType}:${service.serviceId}`"
            variant="secondary"
          >
            {{ service.serviceType }} · {{ service.serviceId }} ·
            {{ t(service.source) }}
          </Badge>
          <span
            v-if="detail.capabilities.services.length === 0"
            class="text-sm text-muted-foreground"
          >
            {{ t("未声明服务能力") }}
          </span>
        </div>
        <div class="flex flex-wrap gap-2">
          <Badge
            v-for="component in detail.capabilities.components"
            :key="`${component.source}:${component.slot}:${component.componentId}`"
            variant="secondary"
          >
            {{ component.slot }} · {{ component.componentId }}
          </Badge>
        </div>
        <p
          v-if="detail.capabilities.hasRuntimeRoute"
          class="text-sm text-muted-foreground"
        >
          {{ t("此插件已挂载运行时路由") }}
        </p>
      </CardContent>
    </Card>

    <PluginConfigEditor
      :detail="detail"
      :is-saving="isSaving"
      :is-probing="isProbing"
      @save="
        (value, expectedUpdatedAt) =>
          emit('saveConfig', value, expectedUpdatedAt)
      "
      @probe-candidate="(value) => emit('probeCandidate', value)"
    />

    <PluginProbePanel
      :detail="detail"
      :result="probeResult"
      :is-probing="isProbing"
      @probe-runtime="emit('probeRuntime')"
      @cancel-probe="emit('cancelProbe')"
    />
  </div>
</template>
