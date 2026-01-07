import type { CatPlugin } from "@cat/plugin-core";
import { SimplePatternTokenizer } from "@/tokenizer.ts";

class Plugin implements CatPlugin {
  services() {
    return [new SimplePatternTokenizer()];
  }
}

const plugin = new Plugin();

export default plugin;
