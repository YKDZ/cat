import type { CatPlugin } from "@cat/plugin-core";

import { SimplePatternTokenizer, TermTokenizer } from "@/tokenizer.ts";

class Plugin implements CatPlugin {
  services() {
    return [new SimplePatternTokenizer(), new TermTokenizer()];
  }
}

const plugin = new Plugin();

export default plugin;
