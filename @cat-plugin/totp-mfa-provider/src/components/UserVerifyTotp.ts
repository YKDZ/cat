import { defineCustomElement } from "vue";

import UserVerifyTotp from "./UserVerifyTotp.ce.vue";

const component = defineCustomElement(UserVerifyTotp);

customElements.define("user-verify-totp", component);

export default component;
