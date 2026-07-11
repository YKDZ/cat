export const serverExternalPackages = ["@cat/plugin-core"] as const;
export const serverWorkspaceNoExternal = /^@cat\/(?!plugin-core(?:\/|$))/;
export const serverPluginNoExternal = /^@cat-plugin\//;
