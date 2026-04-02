import type { PackageIR } from "../ir.js";

export const createLlmsTxtRenderer = (): {
  render: (packages: PackageIR[]) => string;
} => {
  const render = (packages: PackageIR[]): string => {
    const lines: string[] = [];

    lines.push("# CAT");
    lines.push("");
    lines.push(
      "> A secure, efficient, and easily extensible self-hosted Computer-Assisted Translation web application.",
    );
    lines.push("");
    lines.push("## Project Info");
    lines.push("");
    lines.push(
      "- Tech stack: TypeScript, Vue 3, Hono, Drizzle ORM, PostgreSQL",
    );
    lines.push("- License: GPL-3.0-only (main app), MIT (packages/plugins)");
    lines.push("");
    lines.push("## Package Documentation");
    lines.push("");

    for (const pkg of packages) {
      const shortName = pkg.name.replace("@cat/", "");
      const url = `./packages/${shortName}.md`;
      const funcCount = pkg.modules.reduce(
        (sum, m) => sum + m.symbols.filter((s) => s.kind === "function").length,
        0,
      );
      lines.push(
        `- [${pkg.name}](${url}): ${funcCount} exported functions — ${pkg.description ?? ""}`,
      );
    }
    lines.push("");

    // Core package summaries
    const domainPkg = packages.find((p) => p.name === "@cat/domain");
    const operationsPkg = packages.find((p) => p.name === "@cat/operations");

    if (domainPkg) {
      lines.push("## @cat/domain");
      lines.push("");
      lines.push(
        "Domain layer using CQRS pattern. Commands mutate state, Queries read data.",
      );
      lines.push("");
      const commands = domainPkg.modules.filter((m) =>
        m.relativePath.includes("commands/"),
      );
      const queries = domainPkg.modules.filter((m) =>
        m.relativePath.includes("queries/"),
      );
      lines.push(
        `- Commands: ${commands.flatMap((c) => c.symbols.filter((s) => s.kind === "function")).length}`,
      );
      lines.push(
        `- Queries: ${queries.flatMap((q) => q.symbols.filter((s) => s.kind === "function")).length}`,
      );
      lines.push("");
    }

    if (operationsPkg) {
      lines.push("## @cat/operations");
      lines.push("");
      lines.push(
        "Operations layer composing domain operations. Functions use `Op` suffix with Zod schema input validation.",
      );
      lines.push("");
    }

    return lines.join("\n");
  };

  return { render };
};
