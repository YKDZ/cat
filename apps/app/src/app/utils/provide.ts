import type { Document } from "@cat/shared";
import type { Glossary } from "@cat/shared";
import type { Memory } from "@cat/shared";
import type { Language } from "@cat/shared";
import type { Plugin } from "@cat/shared";
import type { InjectionKey, Ref } from "vue";

export const documentKey = Symbol() as InjectionKey<Document>;
export const glossaryKey = Symbol() as InjectionKey<Glossary>;
export const memoryKey = Symbol() as InjectionKey<Memory>;
export const languageKey = Symbol() as InjectionKey<Ref<Language | null>>;
export const pluginKey = Symbol() as InjectionKey<Plugin>;

export function useInjectionKey<T>() {
  return function <K extends keyof T>(key: K): InjectionKey<T[K]> {
    return Symbol.for(String(key)) as InjectionKey<T[K]>;
  };
}
