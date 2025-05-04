import { trpc } from "@/server/trpc/client";
import { Project } from "@cat/shared";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useProjectStore = defineStore("project", () => {
  const projects = ref<Project[]>([]);

  const addProjects = (...projectsToAdd: Project[]) => {
    for (const project of projectsToAdd) {
      if (!project) continue;

      const currentIndex = projects.value.findIndex((p) => p.id === project.id);
      if (currentIndex === -1) {
        projects.value.push(project);
      } else {
        projects.value.splice(currentIndex, 1, project);
      }
    }
  };

  const fetchProject = (id: string) => {
    trpc.project.query.query({ id }).then((project) => {
      addProjects(project);
    });
  };

  return {
    projects,
    addProjects,
    fetchProject,
  };
});
