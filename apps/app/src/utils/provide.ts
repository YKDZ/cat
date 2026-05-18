import type { ContentNode } from "@cat/shared";
import type { Glossary } from "@cat/shared";
import type { Memory } from "@cat/shared";
import type { Language } from "@cat/shared";
import type { Plugin } from "@cat/shared";
import type { InjectionKey, Ref } from "vue";

export const contentNodeKey = Symbol() as InjectionKey<ContentNode>;
export const glossaryKey = Symbol() as InjectionKey<Glossary>;
export const memoryKey = Symbol() as InjectionKey<Memory>;
export const languageKey = Symbol() as InjectionKey<Ref<Language | null>>;
export const pluginKey = Symbol() as InjectionKey<Plugin>;

export const useInjectionKey = <T>() => {
  return <K extends keyof T>(key: K): InjectionKey<T[K]> => {
    return Symbol.for(String(key)) as InjectionKey<T[K]>;
  };
};
