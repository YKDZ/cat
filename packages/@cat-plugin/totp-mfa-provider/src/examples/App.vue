<script setup lang="ts">
import UserInitTotp from "@/components/UserInitTotp.ts";
import UserVerifyTotp from "@/components/UserVerifyTotp.ts";

customElements.define("user-init-totp-ce", UserInitTotp);
customElements.define("user-verify-totp-ce", UserVerifyTotp);
</script>

<template>
  <user-init-totp-ce />
  <user-verify-totp-ce />
</template>
