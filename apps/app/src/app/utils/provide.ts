import type { Document } from "@cat/shared/schema/prisma/document";
import type { Glossary } from "@cat/shared/schema/prisma/glossary";
import type { Memory } from "@cat/shared/schema/prisma/memory";
import type { Language } from "@cat/shared/schema/prisma/misc";
import type { Plugin } from "@cat/shared/schema/prisma/plugin";
import type { InjectionKey, Ref } from "vue";

export const documentKey = Symbol() as InjectionKey<Document>;
export const glossaryKey = Symbol() as InjectionKey<Glossary>;
export const memoryKey = Symbol() as InjectionKey<Memory>;
export const languageKey = Symbol() as InjectionKey<Ref<Language | null>>;
export const pluginKey = Symbol() as InjectionKey<Plugin>;

export const useInjectionKey = <Data, K extends keyof Data>(): InjectionKey<
  Data[K]
> => {
  return Symbol() as InjectionKey<Data[K]>;
};
