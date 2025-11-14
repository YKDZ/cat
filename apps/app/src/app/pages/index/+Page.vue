<script setup lang="ts">
import { navigate } from "vike/client/router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/app/components/ui/card";
import { useI18n } from "vue-i18n";
import { Button } from "@/app/components/ui/button";
import { Plus } from "lucide-vue-next";
import { useToastStore } from "@/app/stores/toast";
import LanguagePicker from "@/app/components/LanguagePicker.vue";
import UserUploadAvatarBtn from "@/app/components/UserUploadAvatarBtn.vue";

const { t } = useI18n();
const { info } = useToastStore();
</script>

<template>
  <div class="px-4 py-2 h-full w-full md:py-4 flex">
    <Card class="w-full md:w-1/2 lg:w-1/3">
      <CardHeader>
        <CardTitle>
          {{ t("翻译文件") }}
        </CardTitle>
        <CardDescription>
          {{ t("YAML、JSON 与 Markdown 等") }}
        </CardDescription>
      </CardHeader>
      <CardContent
        ><p>
          {{
            t(
              "点此快速创建一个纯文本文件翻译项目并在文件处理进行完成后进行翻译工作。",
            )
          }}
        </p>
      </CardContent>
      <CardFooter>
        <Button @click="navigate(`/init/file`)" class="w-full">
          <Plus class="mr-2 h-4 w-4" /> {{ t("创建项目") }}
        </Button>
      </CardFooter>
    </Card>
    <UserUploadAvatarBtn />
  </div>
</template>
