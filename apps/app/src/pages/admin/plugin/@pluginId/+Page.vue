<script setup lang="ts">
import type { NonNullJSONType } from "@cat/shared";

import { useData } from "vike-vue/useData";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import * as z from "zod";

import type { PluginProbeResult } from "@/components/plugin/types";

import PluginDetailShell from "@/components/plugin/PluginDetailShell.vue";
import { orpc } from "@/rpc/orpc";
import { useToastStore } from "@/stores/toast";

import type { Data } from "./+data.server";

const { t } = useI18n();
const toast = useToastStore();

const initialData = useData<Data>();
const detail = ref(initialData.detail);
const probeResult = ref<PluginProbeResult | null>(null);
const isBusy = ref(false);
const isSaving = ref(false);
const isProbing = ref(false);
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
  expectedUpdatedAt: string | null,
) => {
  isSaving.value = true;
  try {
    const result = await orpc.plugin.saveConfigAndApply({
      ...scopeInput(),
      value,
      expectedUpdatedAt,
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

const runProbe = async (
  target: "CANDIDATE" | "RUNTIME",
  value?: NonNullJSONType,
) => {
  probeAbortController?.abort();
  probeAbortController = new AbortController();
  isProbing.value = true;
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
    isProbing.value = false;
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
    :is-probing="isProbing"
    @install="handleInstall"
    @uninstall="handleUninstall"
    @reload="handleReload"
    @save-config="handleSaveConfig"
    @probe-candidate="(value) => runProbe('CANDIDATE', value)"
    @probe-runtime="() => runProbe('RUNTIME')"
    @cancel-probe="handleCancelProbe"
  />
</template>
