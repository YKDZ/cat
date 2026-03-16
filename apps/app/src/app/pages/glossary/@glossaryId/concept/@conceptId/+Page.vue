<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.server";
import { computed, ref } from "vue";
import { Button } from "@cat/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@cat/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cat/ui";
import { Input } from "@cat/ui";
import { Textarea } from "@cat/ui";
import { Badge } from "@cat/ui";
import { Label } from "@cat/ui";
import LanguagePicker from "@/app/components/LanguagePicker.vue";
import MultiPicker from "@/app/components/picker/MultiPicker.vue";
import type { PickerOption } from "@/app/components/picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cat/ui";
import { useToastStore } from "@/app/stores/toast";
import { orpc } from "@/server/orpc";
import { logger } from "@cat/shared/utils";
import {
  TermStatusValues,
  TermTypeValues,
  type TermStatus,
  type TermType,
} from "@cat/shared/schema/drizzle/enum";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const { concept, subjects, terms, availableSubjects } = useData<Data>();
const toastStore = useToastStore();

// 编辑概念状态
const isEditingConcept = ref(false);
const editedSubjectIds = ref<number[]>(subjects.map((s) => s.id));
const editedDefinition = ref(concept.definition || "");
const isUpdatingConcept = ref(false);

// 主题选择器选项
const subjectOptions = computed<PickerOption<number>[]>(() => {
  return [
    ...availableSubjects.map((subject) => ({
      value: subject.id,
      content: subject.subject,
    })),
  ];
});

// 新术语状态
const isNewTermDialogOpen = ref(false);
const newTermText = ref("");
const newTermLanguageId = ref("en");
const newTermType = ref<TermType>("NOT_SPECIFIED");
const newTermStatus = ref<TermStatus>("PREFERRED");
const isAddingTerm = ref(false);

// 保存概念更改
const saveConceptChanges = async () => {
  isUpdatingConcept.value = true;

  try {
    await orpc.glossary.updateConcept({
      conceptId: concept.id,
      subjectIds: editedSubjectIds.value,
      definition: editedDefinition.value || undefined,
    });

    isEditingConcept.value = false;
    toastStore.info(t("概念已成功更新"));
    location.reload();
  } catch (error) {
    logger.error("WEB", { msg: "更新概念失败" }, error);
    toastStore.error(t("更新概念失败，请重试"));
  } finally {
    isUpdatingConcept.value = false;
  }
};

// 添加新术语
const addNewTerm = async () => {
  if (!newTermText.value.trim()) {
    toastStore.error(t("术语文本不能为空"));
    return;
  }

  isAddingTerm.value = true;

  try {
    await orpc.glossary.addTermToConcept({
      conceptId: concept.id,
      text: newTermText.value,
      languageId: newTermLanguageId.value,
      type: newTermType.value,
      status: newTermStatus.value,
    });

    // 重新加载页面或刷新术语列表
    location.reload();

    toastStore.info(t("术语已成功添加"));
  } catch (error) {
    logger.error("WEB", { msg: "添加术语失败" }, error);
    toastStore.error(t("添加术语失败，请重试"));
  } finally {
    isAddingTerm.value = false;
  }
};
</script>

<template>
  <div class="container mx-auto py-6">
    <Card class="mb-6">
      <CardHeader>
        <div class="flex items-start justify-between">
          <div>
            <CardTitle v-if="!isEditingConcept" class="text-2xl">
              {{ subjects?.[0]?.subject || t("（未命名）") }}
            </CardTitle>
            <div v-else class="space-y-4">
              <div>
                <Label>{{ t("概念主题") }}</Label>
                <MultiPicker
                  v-model="editedSubjectIds"
                  :options="subjectOptions"
                  :placeholder="t('搜索主题...')"
                  :portal="true"
                />
              </div>
              <div>
                <Label for="definition">{{ t("概念定义") }}</Label>
                <Textarea
                  id="definition"
                  v-model="editedDefinition"
                  :placeholder="t('概念定义')"
                  rows="3"
                  :disabled="isUpdatingConcept"
                />
              </div>
              <div class="flex gap-2">
                <Button
                  @click="saveConceptChanges"
                  :disabled="isUpdatingConcept"
                >
                  <span v-if="isUpdatingConcept">{{ t("保存中...") }}</span>
                  <span v-else>{{ t("保存") }}</span>
                </Button>
                <Button
                  variant="outline"
                  @click="isEditingConcept = false"
                  :disabled="isUpdatingConcept"
                >
                  {{ t("取消") }}
                </Button>
              </div>
            </div>
          </div>
          <Button
            v-if="!isEditingConcept"
            variant="outline"
            @click="isEditingConcept = true"
          >
            {{ t("编辑概念") }}
          </Button>
        </div>

        <div v-if="!isEditingConcept" class="mt-2">
          <p class="text-gray-600">
            {{
              concept.definition ||
              subjects?.[0]?.defaultDefinition ||
              t("暂无定义")
            }}
          </p>
        </div>
      </CardHeader>
    </Card>

    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle>{{ t("术语条目") }}</CardTitle>
          <Dialog v-model:open="isNewTermDialogOpen">
            <DialogTrigger as-child>
              <Button>{{ t("添加术语") }}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{{ t("添加新术语") }}</DialogTitle>
              </DialogHeader>

              <div class="space-y-4 py-4">
                <div>
                  <Label for="term-text">{{ t("术语文本") }}</Label>
                  <Input
                    id="term-text"
                    v-model="newTermText"
                    :placeholder="t('输入术语文本')"
                    :disabled="isAddingTerm"
                  />
                </div>

                <div>
                  <Label for="term-language">{{ t("语言") }}</Label>
                  <LanguagePicker
                    id="term-language"
                    v-model="newTermLanguageId"
                  />
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <Label for="term-type">{{ t("类型") }}</Label>
                    <select
                      id="term-type"
                      v-model="newTermType"
                      class="w-full rounded-md border border-input bg-background px-3 py-2"
                      :disabled="isAddingTerm"
                    >
                      <option
                        v-for="termTypeOption in TermTypeValues"
                        :key="termTypeOption"
                        :value="termTypeOption"
                      >
                        {{ termTypeOption }}
                      </option>
                    </select>
                  </div>

                  <div>
                    <Label for="term-status">{{ t("状态") }}</Label>
                    <select
                      id="term-status"
                      v-model="newTermStatus"
                      class="w-full rounded-md border border-input bg-background px-3 py-2"
                      :disabled="isAddingTerm"
                    >
                      <option
                        v-for="termStatusOption in TermStatusValues"
                        :key="termStatusOption"
                        :value="termStatusOption"
                      >
                        {{ termStatusOption }}
                      </option>
                    </select>
                  </div>
                </div>

                <Button
                  class="w-full"
                  @click="addNewTerm"
                  :disabled="!newTermText.trim() || isAddingTerm"
                >
                  <span v-if="isAddingTerm">{{ t("添加中...") }}</span>
                  <span v-else>{{ t("添加术语") }}</span>
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ t("术语") }}</TableHead>
              <TableHead>{{ t("语言") }}</TableHead>
              <TableHead>{{ t("类型") }}</TableHead>
              <TableHead>{{ t("状态") }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="term in terms" :key="term.id">
              <TableCell>{{ term.text }}</TableCell>
              <TableCell>
                <Badge variant="secondary">{{ term.languageId }}</Badge>
              </TableCell>
              <TableCell>
                <Badge
                  :variant="
                    term.type === 'FULL_FORM'
                      ? 'default'
                      : term.type === 'ACRONYM'
                        ? 'outline'
                        : 'secondary'
                  "
                >
                  {{ term.type }}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  :variant="
                    term.status === 'PREFERRED'
                      ? 'default'
                      : term.status === 'ADMITTED'
                        ? 'outline'
                        : 'secondary'
                  "
                >
                  {{ term.status }}
                </Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
