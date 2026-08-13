import {
  applyBootstrapPlan,
  BootstrapPlanSchema,
  executeCommand,
  type BootstrapPlan,
} from "@cat/domain";

import {
  bootstrapApplicationData,
  syncApplicationPluginDefinitions,
  type ApplicationDataBootstrapOptions,
} from "./application-data-bootstrap.ts";

const defaultDeploymentBootstrapPlan: BootstrapPlan = {
  version: "1",
  idempotencyKey: "official-spacy-v1",
  operations: [
    {
      type: "install-if-absent",
      pluginId: "spacy-language-analyzer",
      scopeType: "GLOBAL",
      scopeId: "",
      value: { serverUrl: "http://spacy:8000" },
    },
  ],
};

export const resolveDeploymentBootstrapPlan = (
  value = process.env.CAT_BOOTSTRAP_PLAN,
): BootstrapPlan => {
  if (value === undefined || value === "")
    return defaultDeploymentBootstrapPlan;
  return BootstrapPlanSchema.parse(JSON.parse(value));
};

/**
 * The standalone bootstrap-only and prepare-and-start lifecycle commands use
 * this path before HTTP runtime exists. The runtime start-only command never
 * receives a deployment plan.
 */
export const bootstrapDeployment = async (
  options: ApplicationDataBootstrapOptions,
  plan = resolveDeploymentBootstrapPlan(),
): Promise<{ status: "applied" | "noop" }> => {
  await syncApplicationPluginDefinitions(options);
  const result = await executeCommand(
    { db: options.database.client },
    applyBootstrapPlan,
    plan,
  );
  await bootstrapApplicationData(options);
  return result;
};
