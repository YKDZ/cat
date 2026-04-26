<script setup lang="ts">
import type { ScopeType } from "@cat/shared";
import type { Component } from "vue";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
} from "@cat/ui";
import {
  Bot,
  Check,
  Languages,
  Power,
  PowerOff,
  ShieldCheck,
  Trash2,
} from "@lucide/vue";
import { inject, ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/rpc/orpc";
import { useToastStore } from "@/stores/toast.ts";
import { useInjectionKey } from "@/utils/provide.ts";

import type { Data as LayoutData } from "../+data.server.ts";

const { t } = useI18n();
const { rpcWarn } = useToastStore();
const project = inject(useInjectionKey<LayoutData>()("project"))!;

// ─── Types ───

interface AgentItem {
  id: string;
  name: string;
  description: string;
  scopeType: ScopeType;
  scopeId: string;
  isBuiltin: boolean;
  icon: string | null;
  createdAt: Date;
}

interface BuiltinTemplate {
  templateId: string;
  name: string;
  description: string;
  icon: string;
  tools: string[];
}

// ─── State ───

const enabledAgents = ref<AgentItem[]>([]);
const templates = ref<BuiltinTemplate[]>([]);
const loading = ref(true);
const enablingTemplateId = ref<string | null>(null);

// ─── Computed ───

const enabledBuiltins = computed(() =>
  enabledAgents.value.filter((a) => a.isBuiltin),
);

const customAgents = computed(() =>
  enabledAgents.value.filter((a) => !a.isBuiltin),
);

/**
 * Templates that have NOT been enabled for this project yet.
 */
const availableTemplates = computed(() => {
  const enabledNames = new Set(enabledBuiltins.value.map((a) => a.name));
  return templates.value.filter((t) => !enabledNames.has(t.name));
});

const iconMap: Record<string, Component> = {
  ShieldCheck,
  Languages,
};

const getIcon = (iconName: string | undefined): Component =>
  (iconName ? iconMap[iconName] : undefined) ?? Bot;

const getIconFromDef = (icon: string | null | undefined): Component => {
  if (icon) {
    return getIcon(icon);
  }
  return Bot;
};

// ─── Data Fetching ───

const fetchAll = async () => {
  loading.value = true;
  try {
    const [projectResult, templateResult] = await Promise.allSettled([
      orpc.agent.list({ scopeType: "PROJECT", scopeId: project.id }),
      orpc.agent.listBuiltinTemplates(),
    ]);
    if (projectResult.status === "fulfilled")
      enabledAgents.value = projectResult.value;
    if (templateResult.status === "fulfilled")
      templates.value = templateResult.value;
  } finally {
    loading.value = false;
  }
};

// ─── Enable / Disable ───

const handleEnable = async (tmpl: BuiltinTemplate) => {
  enablingTemplateId.value = tmpl.templateId;
  try {
    await orpc.agent.enableBuiltin({
      templateId: tmpl.templateId,
      scopeType: "PROJECT",
      scopeId: project.id,
    });
    await fetchAll();
  } catch (err) {
    rpcWarn(err);
  } finally {
    if (enablingTemplateId.value === tmpl.templateId) {
      enablingTemplateId.value = null;
    }
  }
};

const handleDisable = async (agentId: string) => {
  try {
    await orpc.agent.disableBuiltin({ id: agentId });
    enabledAgents.value = enabledAgents.value.filter((a) => a.id !== agentId);
  } catch (err) {
    rpcWarn(err);
  }
};

const handleDelete = async (agentId: string) => {
  await orpc.agent.remove({ id: agentId });
  enabledAgents.value = enabledAgents.value.filter((a) => a.id !== agentId);
};

onMounted(() => {
  void fetchAll();
});
</script>

<template>
  <div class="flex w-full flex-col gap-6 pt-3">
    <!-- Available builtin templates -->
    <section>
      <h2 class="mb-3 text-lg font-semibold">
        {{ t("内置 Agent") }}
      </h2>
      <p class="mb-4 text-sm text-muted-foreground">
        {{ t("系统预置的 Agent 模板，启用后即可在编辑器中使用。") }}
      </p>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <!-- Templates not yet enabled -->
        <Card v-for="tmpl in availableTemplates" :key="tmpl.templateId">
          <CardHeader class="flex flex-row items-start gap-3">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
            >
              <component :is="getIcon(tmpl.icon)" class="h-5 w-5" />
            </div>
            <div class="flex min-w-0 flex-col gap-1">
              <div class="flex items-center gap-2">
                <CardTitle class="text-base">{{ tmpl.name }}</CardTitle>
                <Badge variant="secondary" class="text-xs">{{
                  t("内置")
                }}</Badge>
              </div>
              <p class="text-xs text-muted-foreground">
                {{ tmpl.description }}
              </p>
            </div>
          </CardHeader>
          <CardContent class="flex justify-end pt-0">
            <Button
              variant="outline"
              size="sm"
              :disabled="enablingTemplateId !== null"
              @click="handleEnable(tmpl)"
            >
              <Power class="mr-1.5 h-4 w-4" />
              {{
                enablingTemplateId === tmpl.templateId
                  ? t("启用中...")
                  : t("启用")
              }}
            </Button>
          </CardContent>
        </Card>

        <!-- Already-enabled builtin agents -->
        <Card v-for="agent in enabledBuiltins" :key="agent.id">
          <CardHeader class="flex flex-row items-start gap-3">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-green-500/10 text-green-600 dark:text-green-400"
            >
              <component :is="getIconFromDef(agent.icon)" class="h-5 w-5" />
            </div>
            <div class="flex min-w-0 flex-col gap-1">
              <div class="flex items-center gap-2">
                <CardTitle class="text-base">{{ agent.name }}</CardTitle>
                <Badge variant="default" class="text-xs">
                  <Check class="mr-0.5 h-3 w-3" />
                  {{ t("已启用") }}
                </Badge>
              </div>
              <p class="text-xs text-muted-foreground">
                {{ agent.description }}
              </p>
            </div>
          </CardHeader>
          <CardContent class="flex justify-end pt-0">
            <Button
              variant="ghost"
              size="sm"
              class="text-destructive hover:text-destructive"
              @click="handleDisable(agent.id)"
            >
              <PowerOff class="mr-1.5 h-4 w-4" />
              {{ t("停用") }}
            </Button>
          </CardContent>
        </Card>
      </div>

      <p
        v-if="!loading && templates.length === 0"
        class="text-sm text-muted-foreground"
      >
        {{ t("暂无内置 Agent") }}
      </p>
    </section>

    <Separator />

    <!-- Project-scoped custom agents -->
    <section>
      <div class="mb-3 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold">
            {{ t("项目 Agent") }}
          </h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ t("仅在当前项目中可用的自定义 Agent。") }}
          </p>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Card v-for="agent in customAgents" :key="agent.id">
          <CardHeader class="flex flex-row items-start gap-3">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
            >
              <component :is="getIconFromDef(agent.icon)" class="h-5 w-5" />
            </div>
            <div class="flex min-w-0 flex-col gap-1">
              <div class="flex items-center gap-2">
                <CardTitle class="text-base">{{ agent.name }}</CardTitle>
              </div>
              <p class="text-xs text-muted-foreground">
                {{ agent.description }}
              </p>
            </div>
          </CardHeader>
          <CardContent class="flex justify-end pt-0">
            <Button
              variant="ghost"
              size="icon"
              class="text-destructive hover:text-destructive"
              @click="handleDelete(agent.id)"
            >
              <Trash2 class="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
      <p
        v-if="!loading && customAgents.length === 0"
        class="text-sm text-muted-foreground"
      >
        {{ t("暂无项目级 Agent，可在编辑器中使用内置 Agent。") }}
      </p>
    </section>
  </div>
</template>
