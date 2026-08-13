<script setup lang="ts">
import type { NonNullJSONType } from "@cat/shared";
import { useData } from "vike-vue/useData";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import * as z from "zod";

import PluginDetailShell from "#/components/plugin/PluginDetailShell.vue";
import type {
  PluginProbeResult,
  PluginProbeTarget,
} from "#/components/plugin/types.ts";
import { orpc } from "#/rpc/orpc.ts";
import { useToastStore } from "#/stores/toast.ts";

import type { Data } from "./+data.server.ts";

const { t } = useI18n();
const toast = useToastStore();

const initialData = useData<Data>();
const detail = ref(initialData.detail);
const probeResult = ref<PluginProbeResult | null>(null);
const isBusy = ref(false);
const isSaving = ref(false);
const activeProbeTarget = ref<PluginProbeTarget | null>(null);
let probeAbortController: AbortController | null = null;
const rpcErrorSchema = z.object({ message: z.string().optional() });

const scopeInput = () => ({
  pluginId: detail.value.plugin.id,
  scopeType: "GLOBAL" as const,
  scopeId: "",
});

const refreshDetail = async () => {
  const next = await orpc.plugin.getDetail(scopeInput());
  if (next) detail.value = next;
};

const warnRpc = (error: unknown) => {
  const parsed = rpcErrorSchema.safeParse(error);
  toast.warn(
    t(parsed.success ? (parsed.data.message ?? "操作失败") : "操作失败"),
  );
};

const runAction = async (
  action: () => Promise<{ message: string; status: string }>,
) => {
  isBusy.value = true;
  try {
    const result = await action();
    if (result.status.endsWith("WARNING")) {
      toast.warn(t(result.message));
    } else {
      toast.info(t(result.message));
    }
    await refreshDetail();
  } catch (error) {
    warnRpc(error);
    await refreshDetail().catch(() => undefined);
  } finally {
    isBusy.value = false;
  }
};

const handleInstall = async () => {
  await runAction(() => orpc.plugin.install(scopeInput()));
};

const handleUninstall = async () => {
  await runAction(() => orpc.plugin.uninstall(scopeInput()));
};

const handleReload = async () => {
  await runAction(() => orpc.plugin.reloadPlugin(scopeInput()));
};

const handleSaveConfig = async (
  value: NonNullJSONType,
  expectedRevision: number | null,
) => {
  isSaving.value = true;
  try {
    const result = await orpc.plugin.saveConfigAndApply({
      ...scopeInput(),
      value,
      expectedRevision,
    });
    if (result.status === "APPLIED") {
      toast.info(t(result.message));
    } else if (result.status === "ROLLED_BACK") {
      toast.warn(t(result.message));
    } else if (result.status === "ROLLBACK_FAILED") {
      toast.error(t(result.message));
    } else {
      toast.warn(t(result.message));
    }
    await refreshDetail();
  } catch (error) {
    warnRpc(error);
  } finally {
    isSaving.value = false;
  }
};

const handleMigrateConfig = async (value: NonNullJSONType) => {
  const config = detail.value.config;
  const instance = config.instance;
  if (!config.config || !instance) return;

  isSaving.value = true;
  try {
    const result = await orpc.plugin.migrateConfigAndApply({
      ...scopeInput(),
      instanceId: instance.id,
      fromVersion: instance.appliedVersion,
      expectedSchemaDigest: config.config.schemaDigest,
      expectedRevision: instance.revision,
      value,
    });
    toast.info(t(result.message));
    await refreshDetail();
  } catch (error) {
    warnRpc(error);
    await refreshDetail().catch(() => undefined);
  } finally {
    isSaving.value = false;
  }
};

const runProbe = async (target: PluginProbeTarget, value?: NonNullJSONType) => {
  probeAbortController?.abort();
  probeAbortController = new AbortController();
  activeProbeTarget.value = target;
  try {
    probeResult.value = await orpc.plugin.probeConfig(
      { ...scopeInput(), target, value },
      { signal: probeAbortController.signal },
    );
    toast.info(
      t("检测完成：{status}", { status: t(probeResult.value.overallStatus) }),
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      toast.warn(t("检测已取消"));
      return;
    }
    warnRpc(error);
  } finally {
    activeProbeTarget.value = null;
    probeAbortController = null;
  }
};

const handleCancelProbe = () => {
  probeAbortController?.abort();
};
</script>

<template>
  <PluginDetailShell
    :detail="detail"
    :probe-result="probeResult"
    :is-busy="isBusy"
    :is-saving="isSaving"
    :active-probe-target="activeProbeTarget"
    @install="handleInstall"
    @uninstall="handleUninstall"
    @reload="handleReload"
    @save-config="handleSaveConfig"
    @migrate-config="handleMigrateConfig"
    @probe-candidate="(value) => runProbe('CANDIDATE', value)"
    @probe-runtime="() => runProbe('RUNTIME')"
    @cancel-probe="handleCancelProbe"
  />
</template>
