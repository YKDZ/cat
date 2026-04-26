<script setup lang="ts">
import { Button } from "@cat/ui";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/rpc/orpc";
import { useToastStore } from "@/stores/toast.ts";

const props = defineProps<{
  projectId: string;
}>();

const { t } = useI18n();
const { rpcWarn } = useToastStore();

const trustList = ref<
  {
    subjectType: string;
    subjectId: string;
    hasDirectEditor: boolean;
    hasIsolationForced: boolean;
    trustMode: "direct" | "isolation";
  }[]
>([]);

const load = async () => {
  const result = await orpc.trustSettings
    .listTrustStatus({ projectId: props.projectId })
    .catch(rpcWarn);
  if (result) trustList.value = result;
};

const grantIsolation = async (subjectType: string, subjectId: string) => {
  await orpc.trustSettings
    .grantIsolationForced({
      projectId: props.projectId,
      subjectType: subjectType as "user" | "role" | "agent",
      subjectId,
    })
    .catch(rpcWarn);
  await load();
};

const revokeIsolation = async (subjectType: string, subjectId: string) => {
  await orpc.trustSettings
    .revokeIsolationForced({
      projectId: props.projectId,
      subjectType: subjectType as "user" | "role" | "agent",
      subjectId,
    })
    .catch(rpcWarn);
  await load();
};

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-base font-semibold">{{ t("Isolation 例外管理") }}</h2>
    <p class="text-sm text-muted-foreground">
      {{ t("为拥有编辑权限的 Subject 配置 Trust 或 Isolation 模式。") }}
    </p>

    <div v-if="trustList.length === 0" class="text-sm text-muted-foreground">
      {{ t("暂无具有编辑权限的成员。") }}
    </div>

    <table v-else class="w-full text-sm">
      <thead>
        <tr class="border-b text-left text-xs text-muted-foreground">
          <th class="pb-2 font-normal">{{ t("主体") }}</th>
          <th class="pb-2 font-normal">{{ t("模式") }}</th>
          <th class="pb-2 font-normal">{{ t("操作") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in trustList"
          :key="`${item.subjectType}:${item.subjectId}`"
          class="border-b last:border-0"
        >
          <td class="py-2">
            <span class="mr-1 text-xs text-muted-foreground"
              >[{{ item.subjectType }}]</span
            >
            {{ item.subjectId }}
          </td>
          <td class="py-2">
            <span
              class="rounded-full px-2 py-0.5 text-xs"
              :class="
                item.trustMode === 'direct'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-orange-100 text-orange-700'
              "
            >
              {{ item.trustMode }}
            </span>
          </td>
          <td class="py-2">
            <Button
              v-if="item.trustMode === 'direct'"
              size="sm"
              variant="outline"
              @click="grantIsolation(item.subjectType, item.subjectId)"
            >
              {{ t("强制 Isolation") }}
            </Button>
            <Button
              v-else
              size="sm"
              variant="outline"
              @click="revokeIsolation(item.subjectType, item.subjectId)"
            >
              {{ t("移除 Isolation") }}
            </Button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
