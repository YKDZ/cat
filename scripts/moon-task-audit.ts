import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

type TaskInfo = {
  id?: string;
  command?: string;
  script?: string;
  deps?: Array<string | { target?: string; project?: string; task?: string }>;
  options?: { cache?: boolean };
  outputs?: string[];
};

type NestedTaskMap = Record<string, Record<string, TaskInfo>>;

type FlatTaskMap = Record<string, TaskInfo>;

type MoonTasksOutput = {
  tasks?: NestedTaskMap | FlatTaskMap;
};

const isTaskInfo = (value: unknown): value is TaskInfo => {
  if (typeof value !== "object" || value === null) return false;
  return (
    "command" in value ||
    "script" in value ||
    "deps" in value ||
    "options" in value ||
    "outputs" in value
  );
};

const output = JSON.parse(
  execFileSync("pnpm", ["moon", "query", "tasks"], { encoding: "utf8" }),
) as MoonTasksOutput;

const findTask = (target: string): TaskInfo | undefined => {
  const tasks = output.tasks;
  if (!tasks) return undefined;

  const direct = tasks[target as keyof typeof tasks];
  if (isTaskInfo(direct)) {
    return direct;
  }

  const [projectId, taskId] = target.split(":");
  if (!projectId || !taskId) {
    throw new Error(`Invalid target ${target}`);
  }

  const projectTasks = tasks[projectId as keyof typeof tasks];
  if (
    typeof projectTasks === "object" &&
    projectTasks !== null &&
    !Array.isArray(projectTasks) &&
    taskId in projectTasks
  ) {
    const task = (projectTasks as Record<string, TaskInfo>)[taskId];
    return isTaskInfo(task) ? task : undefined;
  }

  return undefined;
};

const normalizeDeps = (task: TaskInfo | undefined): string[] => {
  return (task?.deps ?? []).map((dep) => {
    if (typeof dep === "string") return dep;
    if (dep.target) return dep.target;
    if (dep.project && dep.task) return `${dep.project}:${dep.task}`;
    if (dep.task) return dep.task;
    return JSON.stringify(dep);
  });
};

const required = [
  "app:build",
  "app:test",
  "app-api:test",
  "domain:test",
  "db:push",
  "db:codegen-schemas",
] as const;

const defaultPluginBuildDeps = [
  "password-auth-provider:build",
  "json-file-handler:build",
  "yaml-file-handler:build",
  "markdown-file-handler:build",
  "local-storage-provider:build",
  "basic-tokenizer:build",
  "basic-qa-checker:build",
  "tiny-widget:build",
  "openai-vectorizer:build",
  "openai-llm-provider:build",
  "libretranslate-advisor:build",
  "spacy-segmenter:build",
  "tei-rerank-provider:build",
] as const;

const failures: string[] = [];

for (const target of required) {
  const task = findTask(target);
  if (!task) {
    failures.push(`${target}: missing`);
    continue;
  }

  if (
    target.endsWith(":build") &&
    (!task.outputs || task.outputs.length === 0)
  ) {
    failures.push(`${target}: build task must declare outputs`);
  }

  const command = task.command ?? task.script ?? "";
  if (command.includes("drizzle-kit push") && task.options?.cache !== false) {
    failures.push(`${target}: side-effect DB push must be cache=false`);
  }
}

const appBuildDeps = normalizeDeps(findTask("app:build"));
for (const dep of defaultPluginBuildDeps) {
  if (!appBuildDeps.includes(dep)) {
    failures.push(`app:build missing default plugin dep ${dep}`);
  }
}

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
if (/^\s+redis:\s*$/m.test(workflow) || workflow.includes("REDIS_URL")) {
  failures.push("ci.yml E2E job must not require Redis service or REDIS_URL");
}
if (!workflow.includes("CAT_RUNTIME_PROFILE: lite")) {
  failures.push("ci.yml E2E job must set CAT_RUNTIME_PROFILE: lite");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      checked: [...required],
    },
    null,
    2,
  ),
);
