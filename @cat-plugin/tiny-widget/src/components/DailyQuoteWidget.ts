import { defineCustomElement } from "vue";

import DailyQuoteWidget from "@/components/DailyQuoteWidget.ce.vue";

const ce = defineCustomElement(DailyQuoteWidget);

customElements.define("daily-quote-widget", ce);
