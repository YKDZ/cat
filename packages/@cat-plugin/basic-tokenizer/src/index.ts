import type { CatPlugin } from "@cat/plugin-core";

import {
  NewlineTokenizer,
  NumberTokenizer,
  WhitespaceTokenizer,
  TermTokenizer,
  PunctuationTokenizer,
} from "@/tokenizer.ts";

class Plugin implements CatPlugin {
  services() {
    return [
      // 结构级别 - 最高优先级
      new NewlineTokenizer(),
      // 术语级别 - 高优先级
      new TermTokenizer(),
      // 字面量级别 - 较低优先级
      new NumberTokenizer(),
      new WhitespaceTokenizer(),
      // 最低优先级
      new PunctuationTokenizer(),
    ];
  }
}

const plugin = new Plugin();

export default plugin;
