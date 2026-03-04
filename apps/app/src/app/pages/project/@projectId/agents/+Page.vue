<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { inject, ref, computed, onMounted } from "vue";
import type { Data as LayoutData } from "../+data.server.ts";
import { useInjectionKey } from "@/app/utils/provide.ts";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Separator,
} from "@cat/app-ui";
import {
  Bot,
  Check,
  Languages,
  Power,
  PowerOff,
  ShieldCheck,
  Trash2,
} from "lucide-vue-next";
import { orpc } from "@/server/orpc";
import type { ScopeType } from "@cat/shared/schema/drizzle/enum";
import type { Component } from "vue";

const { t } = useI18n();
const project = inject(useInjectionKey<LayoutData>()("project"))!;

// ─── Types ───

interface AgentItem {
  id: string;
  name: string;
  description: string;
  scopeType: ScopeType;
  scopeId: string;
  isBuiltin: boolean;
  definition: unknown;
  createdAt: Date;
}

interface BuiltinTemplate {
  templateId: string;
  name: string;
  description: string;
  icon: string;
  tools: string[];
}

interface LLMProviderOption {
  id: number;
  serviceId: string;
  name: string;
}

// ─── State ───

const enabledAgents = ref<AgentItem[]>([]);
const templates = ref<BuiltinTemplate[]>([]);
const llmProviders = ref<LLMProviderOption[]>([]);
const loading = ref(true);

/** Dialog state */
const enableDialogOpen = ref(false);
const selectedTemplate = ref<BuiltinTemplate | null>(null);
const selectedProviderId = ref<number | null>(null);
const enabling = ref(false);

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

const getIconFromDef = (def: unknown): Component => {
  if (
    def !== null &&
    def !== undefined &&
    typeof def === "object" &&
    "icon" in def &&
    typeof (def as Record<string, unknown>).icon === "string"
  ) {
    // oxlint-disable-next-line no-unsafe-type-assertion -- guarded by typeof check
    return getIcon((def as Record<string, string>).icon);
  }
  return Bot;
};

// ─── Data Fetching ───

const fetchAll = async () => {
  loading.value = true;
  try {
    const [projectResult, templateResult, providerResult] = await Promise.all([
      orpc.agent.list({ scopeType: "PROJECT", scopeId: project.id }),
      orpc.agent.listBuiltinTemplates(),
      orpc.agent.listLLMProviders(),
    ]);
    enabledAgents.value = projectResult;
    templates.value = templateResult;
    llmProviders.value = providerResult;
  } finally {
    loading.value = false;
  }
};

// ─── Enable / Disable ───

const openEnableDialog = (tmpl: BuiltinTemplate) => {
  selectedTemplate.value = tmpl;
  const first = llmProviders.value[0];
  selectedProviderId.value = first?.id ?? null;
  enableDialogOpen.value = true;
};

const confirmEnable = async () => {
  if (!selectedTemplate.value || selectedProviderId.value === null) return;
  enabling.value = true;
  try {
    await orpc.agent.enableBuiltin({
      templateId: selectedTemplate.value.templateId,
      providerId: selectedProviderId.value,
      scopeType: "PROJECT",
      scopeId: project.id,
    });
    enableDialogOpen.value = false;
    await fetchAll();
  } finally {
    enabling.value = false;
  }
};

const handleDisable = async (agentId: string) => {
  await orpc.agent.disableBuiltin({ id: agentId });
  enabledAgents.value = enabledAgents.value.filter((a) => a.id !== agentId);
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
              :disabled="llmProviders.length === 0"
              @click="openEnableDialog(tmpl)"
            >
              <Power class="mr-1.5 h-4 w-4" />
              {{ t("启用") }}
            </Button>
          </CardContent>
        </Card>

        <!-- Already-enabled builtin agents -->
        <Card v-for="agent in enabledBuiltins" :key="agent.id">
          <CardHeader class="flex flex-row items-start gap-3">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-green-500/10 text-green-600 dark:text-green-400"
            >
              <component
                :is="getIconFromDef(agent.definition)"
                class="h-5 w-5"
              />
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
      <p
        v-if="!loading && llmProviders.length === 0"
        class="mt-2 text-sm text-yellow-600 dark:text-yellow-400"
      >
        {{ t("未检测到 LLM Provider 插件，请先安装并启用 LLM Provider。") }}
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
              <component
                :is="getIconFromDef(agent.definition)"
                class="h-5 w-5"
              />
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

    <!-- Enable dialog with LLM provider picker -->
    <Dialog v-model:open="enableDialogOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {{ t("启用 {name}", { name: selectedTemplate?.name ?? "" }) }}
          </DialogTitle>
          <DialogDescription>
            {{ t("选择一个 LLM Provider 来驱动此 Agent。") }}
          </DialogDescription>
        </DialogHeader>

        <div class="flex flex-col gap-3 py-4">
          <label class="text-sm font-medium">{{ t("LLM Provider") }}</label>
          <select
            class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            :value="selectedProviderId ?? ''"
            @change="
              ($event) => {
                const val = ($event.target as HTMLSelectElement).value;
                selectedProviderId = val ? Number(val) : null;
              }
            "
          >
            <option
              v-for="provider in llmProviders"
              :key="provider.id"
              :value="provider.id"
            >
              {{ provider.name }}
            </option>
          </select>
        </div>

        <DialogFooter>
          <Button
            :disabled="selectedProviderId === null || enabling"
            @click="confirmEnable"
          >
            {{ t("确认启用") }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
