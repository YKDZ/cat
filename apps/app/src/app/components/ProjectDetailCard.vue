<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { Project } from "@cat/shared/schema/drizzle/project";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { trpc } from "@cat/app-api/trpc/client";
import { Button } from "@/app/components/ui/button";
import { Settings } from "lucide-vue-next";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  FormField,
  FormItem,
  FormControl,
  FormLabel,
} from "@/app/components/ui/form";
import * as z from "zod";
import { useForm } from "vee-validate";
import { Textarea } from "@/app/components/ui/textarea";
import { toTypedSchema } from "@vee-validate/zod";
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
  await trpc.project.update.mutate({
    id: props.project.id,
    description: values.description ?? undefined,
  });
  info("保存成功");
});
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex w-full justify-between items-center">
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
