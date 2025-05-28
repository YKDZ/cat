import { Glossary, Language, Project } from "@cat/shared";
import type { InjectionKey, Ref } from "vue";

export const projectKey = Symbol() as InjectionKey<Ref<Project | null>>;
export const glossaryKey = Symbol() as InjectionKey<Ref<Glossary | null>>;
export const languageKey = Symbol() as InjectionKey<Ref<Language | null>>;
