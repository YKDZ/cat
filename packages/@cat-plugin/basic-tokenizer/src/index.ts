import type { CatPlugin } from "@cat/plugin-core";

import {
  NewlineTokenizer,
  NumberTokenizer,
  WhitespaceTokenizer,
  TermTokenizer,
  PunctuationTokenizer,
  LinkTokenizer,
  VariableTokenizer,
  MaskTokenizer,
} from "@/tokenizer.ts";

class Plugin implements CatPlugin {
  services() {
    return [
      // 结构级别 - 最高优先级（800）
      new NewlineTokenizer(),
      new MaskTokenizer(),
      // 术语级别 - 高优先级（600）
      new TermTokenizer(),
      // 变量级别 - 中等优先级（400）
      new LinkTokenizer(),
      new VariableTokenizer(),
      // 字面量级别 - 较低优先级（200）
      new NumberTokenizer(),
      new WhitespaceTokenizer(),
      // 最低优先级（0）
      new PunctuationTokenizer(),
    ];
  }
}

const plugin = new Plugin();

export default plugin;
