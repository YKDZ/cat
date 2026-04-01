<script setup lang="ts">
import { Button, Input } from "@cat/ui";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cat/ui";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@cat/ui";
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import * as z from "zod";

import { orpc } from "@/app/rpc/orpc";
import { useToastStore } from "@/app/stores/toast";

const { t } = useI18n();
const { rpcWarn, info } = useToastStore();


type ApiKey = {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};


const keys = ref<ApiKey[]>([]);
const newKeyRaw = ref<string | null>(null);
const createDialogOpen = ref(false);
const copied = ref(false);


const schema = toTypedSchema(
  z.object({
    name: z.string().min(1, t("请输入密钥名称")).max(100),
    expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
  }),
);


const { handleSubmit, resetForm } = useForm({ validationSchema: schema });


const load = async () => {
  keys.value = await orpc.auth.listApiKeysEndpoint();
};


const onCreateSubmit = handleSubmit(async (values) => {
  const result = await orpc.auth
    .createApiKeyEndpoint({
      name: values.name,
      scopes: [],
      expiresInDays: values.expiresInDays,
    })
    .catch(rpcWarn);
  if (!result) return;

  newKeyRaw.value = result.rawKey;
  resetForm();
  await load();
});


const copyKey = async () => {
  if (!newKeyRaw.value) return;
  await navigator.clipboard.writeText(newKeyRaw.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
};


const revoke = async (id: number) => {
  await orpc.auth.revokeApiKeyEndpoint({ id }).catch(rpcWarn);
  info(t("API 密钥已撤销"));
  await load();
};


onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <!-- 新创建的密钥一次性展示 -->
    <div
      v-if="newKeyRaw"
      class="rounded-lg border border-yellow-500 bg-yellow-50 p-3 dark:bg-yellow-950"
    >
      <p class="mb-2 text-sm font-medium text-yellow-800 dark:text-yellow-200">
        {{ t("请立即复制此密钥，离开后将无法再次查看") }}
      </p>
      <div class="flex items-center gap-2">
        <code class="flex-1 rounded bg-muted p-2 font-mono text-xs break-all">
          {{ newKeyRaw }}
        </code>
        <Button size="sm" variant="outline" @click="copyKey">
          {{ copied ? t("已复制") : t("复制") }}
        </Button>
      </div>
      <Button class="mt-2" size="sm" variant="ghost" @click="newKeyRaw = null">
        {{ t("关闭") }}
      </Button>
    </div>

    <!-- 密钥列表 -->
    <div v-if="keys.length === 0" class="text-sm text-muted-foreground">
      {{ t("暂无 API 密钥") }}
    </div>
    <div
      v-for="key in keys"
      :key="key.id"
      class="flex items-center justify-between rounded-lg border p-3"
    >
      <div class="space-y-0.5">
        <div class="text-sm font-medium">{{ key.name }}</div>
        <div class="font-mono text-xs text-muted-foreground">
          {{ key.keyPrefix }}****
        </div>
        <div class="text-xs text-muted-foreground">
          {{ t("创建于") }} {{ new Date(key.createdAt).toLocaleDateString() }}
          <template v-if="key.lastUsedAt">
            · {{ t("最后使用") }}
            {{ new Date(key.lastUsedAt).toLocaleDateString() }}
          </template>
          <template v-if="key.expiresAt">
            · {{ t("过期") }} {{ new Date(key.expiresAt).toLocaleDateString() }}
          </template>
        </div>
      </div>
      <Button size="sm" variant="destructive" @click="revoke(key.id)">
        {{ t("撤销") }}
      </Button>
    </div>

    <!-- 创建对话框 -->
    <Dialog v-model:open="createDialogOpen">
      <DialogTrigger as-child>
        <Button variant="outline">{{ t("创建 API 密钥") }}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t("创建 API 密钥") }}</DialogTitle>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="onCreateSubmit">
          <FormField v-slot="{ componentField }" name="name">
            <FormItem>
              <FormLabel>{{ t("名称") }}</FormLabel>
              <FormControl>
                <Input :placeholder="t('我的密钥')" v-bind="componentField" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="expiresInDays">
            <FormItem>
              <FormLabel>{{ t("有效期（天）") }}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  :placeholder="t('留空则永久有效')"
                  v-bind="componentField"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <DialogFooter>
            <Button type="submit">{{ t("创建") }}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
