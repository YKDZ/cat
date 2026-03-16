<script setup lang="ts">
import { navigate } from "vike/client/router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@cat/ui";
import { useI18n } from "vue-i18n";
import { Button } from "@cat/ui";
import { Plus } from "lucide-vue-next";
import UserUploadAvatarBtn from "@/app/components/UserUploadAvatarBtn.vue";
import PluginComponentSlot from "@/app/components/plugin/PluginComponentSlot.vue";

const { t } = useI18n();
</script>

<template>
  <div class="flex h-full w-full px-4 py-2 md:py-4">
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
    <PluginComponentSlot id="test" />
  </div>
</template>
