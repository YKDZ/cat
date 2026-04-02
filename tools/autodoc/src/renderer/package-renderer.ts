import type {
  PackageInfo,
  ModuleInfo,
  FunctionSignature,
  TypeDefinition,
} from "../types.js";

export const createPackageRenderer = (): {
  renderPackage: (pkg: PackageInfo, options: { detailed: boolean }) => string;
  renderFunctionSummaryTable: (functions: FunctionSignature[]) => string;
  renderFunctionDetail: (func: FunctionSignature) => string;
} => {
  const renderFunctionSummaryTable = (
    functions: FunctionSignature[],
  ): string => {
    const lines: string[] = [];
    lines.push("| Function | Parameters | Return Type | Description |");
    lines.push("|----------|------------|-------------|-------------|");
    for (const func of functions) {
      const params = func.parameters
        .map((p) => `${p.name}${p.optional ? "?" : ""}`)
        .join(", ");
      lines.push(
        `| \`${func.name}\` | ${params || "-"} | \`${func.returnType ?? "void"}\` | ${func.description ?? "-"} |`,
      );
    }
    return lines.join("\n");
  };

  const renderFunctionDetail = (func: FunctionSignature): string => {
    const lines: string[] = [];
    const params = func.parameters
      .map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.type}`)
      .join(", ");
    const sig = `${func.isAsync ? "async " : ""}${func.name}(${params})${func.returnType ? `: ${func.returnType}` : ""}`;

    lines.push(`#### \`${func.name}\``);
    lines.push("");
    if (func.description) {
      lines.push(func.description);
      lines.push("");
    }
    lines.push("```typescript");
    lines.push(sig);
    lines.push("```");
    lines.push("");

    if (func.parameters.length > 0) {
      lines.push("| Parameter | Type | Description |");
      lines.push("|-----------|------|-------------|");
      for (const p of func.parameters) {
        lines.push(
          `| ${p.name}${p.optional ? "?" : ""} | \`${p.type}\` | ${p.description ?? "-"} |`,
        );
      }
      lines.push("");
    }

    if (func.returnDescription) {
      lines.push(`**Returns**: ${func.returnDescription}`);
      lines.push("");
    }

    return lines.join("\n");
  };

  const renderTypeTable = (types: TypeDefinition[]): string => {
    const lines: string[] = [];
    lines.push("| Type | Kind | Description |");
    lines.push("|------|------|-------------|");
    for (const t of types) {
      lines.push(`| \`${t.name}\` | ${t.kind} | ${t.description ?? "-"} |`);
    }
    return lines.join("\n");
  };

  const renderPackage = (
    pkg: PackageInfo,
    options: { detailed: boolean },
  ): string => {
    const lines: string[] = [];

    lines.push(`# ${pkg.name}`);
    lines.push("");
    if (pkg.description) {
      lines.push(pkg.description);
      lines.push("");
    }

    // Summary statistics
    const allFunctions = pkg.modules.flatMap((m) => m.functions);
    const allTypes = pkg.modules.flatMap((m) => m.types);
    lines.push("## Overview");
    lines.push("");
    lines.push(`- **Modules**: ${pkg.modules.length}`);
    lines.push(`- **Exported functions**: ${allFunctions.length}`);
    lines.push(`- **Exported types**: ${allTypes.length}`);
    lines.push("");

    // Group by directory
    lines.push("## Function Index");
    lines.push("");

    const grouped = new Map<string, ModuleInfo[]>();
    for (const mod of pkg.modules) {
      const dir = mod.relativePath.includes("/")
        ? mod.relativePath.split("/").slice(0, -1).join("/")
        : "(root)";
      const list = grouped.get(dir) ?? [];
      list.push(mod);
      grouped.set(dir, list);
    }

    for (const [dir, modules] of grouped) {
      lines.push(`### ${dir}`);
      lines.push("");
      const funcs = modules.flatMap((m) => m.functions);
      if (funcs.length > 0) {
        lines.push(renderFunctionSummaryTable(funcs));
        lines.push("");
      } else {
        lines.push("*No exported functions*");
        lines.push("");
      }
    }

    // Type index
    if (allTypes.length > 0) {
      lines.push("## Type Index");
      lines.push("");
      lines.push(renderTypeTable(allTypes));
      lines.push("");
    }

    // Detailed function docs for high-priority packages
    if (options.detailed) {
      lines.push("## Detailed Documentation");
      lines.push("");
      for (const [dir, modules] of grouped) {
        lines.push(`### ${dir}`);
        lines.push("");
        for (const mod of modules) {
          for (const func of mod.functions) {
            lines.push(renderFunctionDetail(func));
          }
        }
      }
    }

    lines.push(`\n*Last updated: ${new Date().toISOString().split("T")[0]}*`);
    return lines.join("\n");
  };

  return { renderPackage, renderFunctionSummaryTable, renderFunctionDetail };
};
