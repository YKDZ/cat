<script setup lang="ts">
import type { Project } from "@cat/shared";

import { Card, CardContent, CardHeader, CardTitle } from "@cat/ui";
import { Button } from "@cat/ui";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@cat/ui";
import { FormField, FormItem, FormControl, FormLabel } from "@cat/ui";
import { Textarea } from "@cat/ui";
import { Settings } from "@lucide/vue";
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";
import { useI18n } from "vue-i18n";
import * as z from "zod";

import { orpc } from "@/app/rpc/orpc";
import { useToastStore } from "@/app/stores/toast";

const { t } = useI18n();
const { info } = useToastStore();

const props = defineProps<{ project: Pick<Project, "id" | "description"> }>();

const schema = toTypedSchema(
  z.object({
    description: z.string().nullable(),
  }),
);

const { handleSubmit } = useForm({
  validationSchema: schema,
  initialValues: {
    description: props.project.description,
  },
});

const onSubmit = handleSubmit(async (values) => {
  await orpc.project.update({
    projectId: props.project.id,
    description: values.description ?? undefined,
  });
  info("保存成功");
});
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex w-full items-center justify-between">
        <CardTitle>{{ t("关于") }}</CardTitle>
        <Dialog>
          <DialogTrigger>
            <Button variant="ghost" size="icon-sm">
              <Settings />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{{ t("编辑项目详情") }}</DialogTitle>
            </DialogHeader>
            <form class="space-y-4" @submit="onSubmit">
              <FormField v-slot="{ componentField }" name="description">
                <FormItem>
                  <FormLabel>{{ t("描述") }}</FormLabel>
                  <FormControl>
                    <Textarea v-bind="componentField" />
                  </FormControl>
                </FormItem>
              </FormField>
              <Button type="submit">
                {{ t("保存") }}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </CardHeader>
    <CardContent>
      <p>{{ project.description }}</p>
    </CardContent>
  </Card>
</template>
