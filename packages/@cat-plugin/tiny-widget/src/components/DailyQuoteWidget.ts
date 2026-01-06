import DailyQuoteWidget from "@/components/DailyQuoteWidget.ce.vue";
import { defineCustomElement } from "vue";

const ce = defineCustomElement(DailyQuoteWidget);

customElements.define("daily-quote-widget", ce);
