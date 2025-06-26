import { trpc } from "@/server/trpc/client";
import type { Project } from "@cat/shared";
import { defineStore } from "pinia";
import { reactive, ref } from "vue";

export type TranslationCount = {
  languageId: string;
  translatedEleAmount: number;
  approvedTranslationAmount: number;
};

export const useProjectStore = defineStore("project", () => {
  const projects = ref<Project[]>([]);
  const translationAmounts = reactive(new Map<string, TranslationCount>());
  const translatableEleAmounts = reactive(new Map<string, number>());

  const addProjects = (...projectsToAdd: Project[]) => {
    for (const project of projectsToAdd) {
      if (!project) continue;

      const currentIndex = projects.value.findIndex(
        (p: Project) => p.id === project.id,
      );
      if (currentIndex === -1) {
        projects.value.push(project);
      } else {
        projects.value.splice(currentIndex, 1, project);
      }
    }
  };

  const fetchProject = (id: string) => {
    trpc.project.query.query({ id }).then((project) => {
      if (project === null) return;
      addProjects(project);
    });
  };

  const updateTranslationAmount = async (id: string, languageId: string) => {
    const translatedEleAmount = await trpc.project.countElement.query({
      id,
      isTranslated: true,
    });

    const approvedTranslationAmount = await trpc.project.countTranslation.query(
      {
        id,
        languageId,
        isApproved: true,
      },
    );

    translationAmounts.set(id, {
      languageId,
      translatedEleAmount,
      approvedTranslationAmount,
    } satisfies TranslationCount);
  };

  const updateTranslatableEleAmount = async (id: string) => {
    await trpc.project.countElement
      .query({
        id,
      })
      .then((amount) => {
        translatableEleAmounts.set(id, amount);
      });
  };

  return {
    projects,
    translatableEleAmounts,
    translationAmounts,
    addProjects,
    fetchProject,
    updateTranslationAmount,
    updateTranslatableEleAmount,
  };
});
