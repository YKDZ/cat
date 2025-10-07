import type { Document } from "@cat/shared/schema/drizzle/document";
import type { Glossary } from "@cat/shared/schema/drizzle/glossary";
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import type { Language } from "@cat/shared/schema/drizzle/misc";
import type { Plugin } from "@cat/shared/schema/drizzle/plugin";
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
