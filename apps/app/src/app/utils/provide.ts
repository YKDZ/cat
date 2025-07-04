import type { Glossary, Language, Memory, Plugin, Project } from "@cat/shared";
import type { InjectionKey, Ref } from "vue";

export const projectKey = Symbol() as InjectionKey<Ref<Project | null>>;
export const glossaryKey = Symbol() as InjectionKey<Ref<Glossary | null>>;
export const memoryKey = Symbol() as InjectionKey<Ref<Memory | null>>;
export const languageKey = Symbol() as InjectionKey<Ref<Language | null>>;
export const pluginKey = Symbol() as InjectionKey<Ref<Plugin | null>>;
