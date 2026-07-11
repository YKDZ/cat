import { defineCustomElement } from "vue";

import UserInitTotp from "./UserInitTotp.ce.vue";

const component = defineCustomElement(UserInitTotp);

customElements.define("user-init-totp", component);

export default component;
