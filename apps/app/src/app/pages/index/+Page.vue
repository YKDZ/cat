<script setup lang="ts">
import NewProjectCard from "@/app/components/NewProjectCard.vue";
import UserUploadAvatarBtn from "@/app/components/UserUploadAvatarBtn.vue";
import { navigate } from "vike/client/router";

const handleClick = async () => {
  await navigate(`/init/file`);
};
</script>

<template>
  <div class="px-4 py-2 h-full w-full md:py-4">
    <NewProjectCard
      title="翻译文件"
      subtitle="YAML、JSON 与 Markdown 等"
      content="点此快速创建一个纯文本文件翻译项目并即刻进行翻译工作。"
      icon="i-mdi:file"
      @click="handleClick"
    ></NewProjectCard>
    <UserUploadAvatarBtn />
  </div>
</template>
