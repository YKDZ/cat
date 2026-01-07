import type { CatPlugin } from "@cat/plugin-core";
import {
  NumberConsistencyChecker,
  VariableConsistencyChecker,
} from "./checker";

class Plugin implements CatPlugin {
  services() {
    return [new NumberConsistencyChecker(), new VariableConsistencyChecker()];
  }
}

const plugin = new Plugin();

export default plugin;
