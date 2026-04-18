<script setup lang="ts">
import {
  Button,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@cat/ui";
import { ChevronLeft } from "@lucide/vue";
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";
import { navigate } from "vike/client/router";
import { inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import * as z from "zod/v4";

import MarkdownEditor from "@/app/components/editor/MarkdownEditor.vue";
import { orpc } from "@/app/rpc/orpc";
import { useToastStore } from "@/app/stores/toast.ts";
import { useInjectionKey } from "@/app/utils/provide.ts";

import type { Data as LayoutData } from "../../+data.server.ts";

const { t } = useI18n();
const { info, rpcWarn } = useToastStore();
const project = inject(useInjectionKey<LayoutData>()("project"))!;

const schema = toTypedSchema(
  z.object({
    title: z.string().min(1, { error: "议题必须有标题" }),
  }),
);

const { handleSubmit } = useForm({
  validationSchema: schema,
  initialValues: { title: "" },
});

const body = ref("");
const isSubmitting = ref(false);

const onSubmit = handleSubmit(async (values) => {
  isSubmitting.value = true;
  try {
    const issue = await orpc.issue.createProjectIssue({
      projectId: project.id,
      title: values.title,
      body: body.value,
    });
    info(t("议题创建成功"));
    await navigate(`/project/${project.id}/issues/${issue.number}`);
  } catch (e) {
    rpcWarn(e);
  } finally {
    isSubmitting.value = false;
  }
});
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6">
    <div class="flex items-center gap-2">
      <a
        :href="`/project/${project.id}/issues`"
        class="text-sm text-muted-foreground hover:underline"
      >
        <ChevronLeft /> {{ t("议题列表") }}
      </a>
    </div>

    <h1 class="text-xl font-semibold">{{ t("新建议题") }}</h1>

    <form class="space-y-4" @submit="onSubmit">
      <FormField v-slot="{ componentField }" name="title">
        <FormItem>
          <FormLabel>{{ t("标题") }}</FormLabel>
          <FormControl>
            <Input
              type="text"
              :placeholder="t('标题')"
              v-bind="componentField"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <div class="space-y-2">
        <label class="text-sm font-medium">{{ t("描述") }}</label>
        <MarkdownEditor v-model="body" />
      </div>

      <div class="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          @click="navigate(`/project/${project.id}/issues`)"
        >
          {{ t("取消") }}
        </Button>
        <Button type="submit" :disabled="isSubmitting">
          {{ t("创建") }}
        </Button>
      </div>
    </form>
  </div>
</template>
