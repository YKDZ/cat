import type { PackageIR } from "../ir.js";
import type { AutodocConfig } from "../types.js";

import { getPackageDocHref } from "../package-doc-path.js";

const countMatchingSymbols = (
  pkg: PackageIR,
  stat: {
    kinds?: Array<"function" | "interface" | "type" | "enum" | "const">;
    pathIncludes?: string;
  },
): number =>
  pkg.modules.reduce((sum, mod) => {
    if (stat.pathIncludes && !mod.relativePath.includes(stat.pathIncludes)) {
      return sum;
    }

    return (
      sum +
      mod.symbols.filter((symbol) =>
        stat.kinds ? stat.kinds.includes(symbol.kind) : true,
      ).length
    );
  }, 0);

export const createLlmsTxtRenderer = (
  config?: AutodocConfig,
): { render: (packages: PackageIR[]) => string } => {
  const render = (packages: PackageIR[]): string => {
    const llmsConfig = config?.llmsTxt ?? {
      enabled: true,
      title: undefined,
      summary: undefined,
      projectInfo: [],
      featuredPackages: [],
    };
    const lines: string[] = [];
    const title = llmsConfig.title ?? config?.project?.name ?? "Autodoc";
    const summary = llmsConfig.summary ?? config?.project?.summary;

    lines.push(`# ${title}`, "");
    if (summary) lines.push(`> ${summary}`, "");

    if (llmsConfig.projectInfo.length > 0) {
      lines.push("## Project Info", "");
      for (const item of llmsConfig.projectInfo) lines.push(`- ${item}`);
      lines.push("");
    }

    lines.push("## Package Documentation", "");
    for (const pkg of packages) {
      const funcCount = pkg.modules.reduce(
        (sum, mod) =>
          sum +
          mod.symbols.filter((symbol) => symbol.kind === "function").length,
        0,
      );
      lines.push(
        `- [${pkg.name}](${getPackageDocHref(pkg.name, config?.packageDocs ?? {})}): ${funcCount} exported functions${pkg.description ? ` — ${pkg.description}` : ""}`,
      );
    }
    lines.push("");

    for (const feature of llmsConfig.featuredPackages) {
      const pkg = packages.find(
        (candidate) => candidate.name === feature.package,
      );
      if (!pkg) continue;

      lines.push(
        `## ${feature.heading ?? feature.package}`,
        "",
        feature.summary,
        "",
      );
      for (const stat of feature.stats) {
        lines.push(`- ${stat.label}: ${countMatchingSymbols(pkg, stat)}`);
      }
      if (feature.stats.length > 0) lines.push("");
    }

    return lines.join("\n");
  };

  return { render };
};
