import type { Document } from "@cat/shared/schema/prisma/document";
import type { Glossary } from "@cat/shared/schema/prisma/glossary";
import type { Memory } from "@cat/shared/schema/prisma/memory";
import type { Language } from "@cat/shared/schema/prisma/misc";
import type { Plugin } from "@cat/shared/schema/prisma/plugin";
import type { Project } from "@cat/shared/schema/prisma/project";
import type { InjectionKey, Ref } from "vue";

export const projectKey = Symbol() as InjectionKey<Ref<Project | null>>;
export const documentKey = Symbol() as InjectionKey<Ref<Document | null>>;
export const glossaryKey = Symbol() as InjectionKey<Ref<Glossary | null>>;
export const memoryKey = Symbol() as InjectionKey<Ref<Memory | null>>;
export const languageKey = Symbol() as InjectionKey<Ref<Language | null>>;
export const pluginKey = Symbol() as InjectionKey<Ref<Plugin | null>>;
