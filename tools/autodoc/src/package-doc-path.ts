import type { AutodocConfig } from "./types.js";

type PackageDocsConfig = NonNullable<AutodocConfig["packageDocs"]>;

const normalizePackageName = (
  packageName: string,
  config: Partial<PackageDocsConfig> = {},
): string => {
  if (config.stripPrefix && packageName.startsWith(config.stripPrefix)) {
    return packageName.slice(config.stripPrefix.length);
  }

  return packageName.replace(/^@/, "").replace(/\//g, "--");
};

export const getPackageDocSlug = (
  packageName: string,
  config: Partial<PackageDocsConfig> = {},
): string => normalizePackageName(packageName, config);

export const getPackageDocHref = (
  packageName: string,
  config: Partial<PackageDocsConfig> = {},
): string => `./packages/${getPackageDocSlug(packageName, config)}.md`;
