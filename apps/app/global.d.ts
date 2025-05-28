import { Pinia, StateTree } from "pinia";
import { User } from "@cat/shared";

declare global {
  namespace Vike {
    interface PageContext {
      user: User | null;
      sessionId: string | null;
      pinia?: Pinia;
      _piniaInitState?: StateTree;
    }
    interface GlobalContext {
      pinia?: Pinia;
    }
  }
}

export {};
