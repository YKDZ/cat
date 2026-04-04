<script setup lang="ts">
import { useI18n } from "vue-i18n";

/**
 * @zh WebAuthnPrompt 的 props（预留）。
 * @en Props for the WebAuthnPrompt node component (reserved for future use).
 */
defineProps<{
  /**
   * @zh 来自认证流节点的客户端提示信息。
   * @en Client hint from the auth flow node.
   */
  hint?: {
    displayInfo?: {
      title?: string;
      description?: string;
    };
  };
}>();

/**
 * @zh 用户完成 WebAuthn 验证时触发。
 * @en Emitted when user completes WebAuthn authentication.
 */
defineEmits<{
  (e: "submit", data: Record<string, unknown>): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col items-center gap-4 py-4 text-center">
    <p class="text-sm text-muted-foreground">
      {{ t("WebAuthn 验证暂不可用") }}
    </p>
  </div>
</template>
