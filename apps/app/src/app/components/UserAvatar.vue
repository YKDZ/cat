<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import type { User } from "@cat/shared";
import { computed, onBeforeMount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  user?: User;
  userId?: string;
  size: number;
  withName?: boolean;
  fullWidth?: boolean;
}>();

const user = ref<User | null>(props.user ?? null);
const avatar = ref<string>("");
const avatarExpiresIn = ref<number>(0);
const isFallback = ref(true);

const containerStyle = computed(() => ({
  gap: props.size * 0.2 + "px",
}));

const imgStyle = computed(() => ({
  width: props.size + "px",
  height: props.size + "px",
  maxWidth: props.size + "px",
  maxHeight: props.size + "px",
  minWidth: props.size + "px",
  minHeight: props.size + "px",
  "font-size": props.size * 0.6 + "px",
}));

const updateAvatar = async () => {
  if (!user.value) return;

  await trpc.user.queryAvatar
    .query({ id: user.value.id })
    .then(({ url, expiresIn }) => {
      avatar.value = url ?? "";
      avatarExpiresIn.value = expiresIn;
    });
};

const handleImgLoad = () => {
  isFallback.value = false;
};

const handleImgError = () => {
  isFallback.value = true;
};

onBeforeMount(async () => {
  if (!props.user && props.userId) {
    user.value = await trpc.user.query.query({ id: props.userId });
  }
  await updateAvatar();
});
</script>

<template>
  <KeepAlive :max="16">
    <div
      v-if="user"
      class="flex select-none items-center"
      :class="{
        'w-full': fullWidth,
      }"
      :style="containerStyle"
    >
      <img
        v-show="!isFallback"
        :src="avatar"
        :style="imgStyle"
        class="rounded-full aspect-square object-cover"
        @load="handleImgLoad"
        @error="handleImgError"
      />
      <div
        v-if="isFallback"
        class="text-base-content text-center rounded-full bg-base flex items-center justify-center overflow-hidden"
        :style="imgStyle"
      >
        <span class="font-bold">{{ user.name.charAt(0).toUpperCase() }}</span>
      </div>
      <span v-if="withName">{{ user.name }}</span>
    </div>
  </KeepAlive>
</template>
