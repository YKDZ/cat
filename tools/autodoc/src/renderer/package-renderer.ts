import type { RootContent } from "mdast";

import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import type { PackageIR, ModuleIR, SymbolIR } from "../ir.js";

import * as md from "./mdast-builder.js";

export const createPackageRenderer = (): {
  renderPackage: (pkg: PackageIR, options: { detailed: boolean }) => string;
} => {
  const processor = unified().use(remarkStringify).use(remarkGfm);

  const renderSymbolBlock = (sym: SymbolIR, _detailed: boolean) => {
    const nodes: RootContent[] = [md.heading(3, md.inlineCode(sym.name))];

    if (sym.kind === "function" && sym.signature) {
      const hasDescription = !!sym.description;
      const paramDocs = (sym.parameters ?? []).filter((p) => p.description);
      const hasReturnDesc = !!sym.returnDescription;
      const hasJsDoc = hasDescription || paramDocs.length > 0 || hasReturnDesc;

      const codeLines: string[] = [];
      if (hasJsDoc) {
        codeLines.push("/**");
        if (sym.description) {
          for (const line of sym.description.split("\n")) {
            codeLines.push(line ? ` * ${line}` : " *");
          }
        }
        if (paramDocs.length > 0) {
          if (hasDescription) codeLines.push(" *");
          for (const p of paramDocs) {
            codeLines.push(` * @param ${p.name} - ${p.description}`);
          }
        }
        if (hasReturnDesc) {
          if (hasDescription || paramDocs.length > 0) codeLines.push(" *");
          codeLines.push(` * @returns ${sym.returnDescription}`);
        }
        codeLines.push(" */");
      }
      codeLines.push(sym.signature);
      nodes.push(md.code("ts", codeLines.join("\n")));
    }

    return nodes;
  };

  const renderPackage = (
    pkg: PackageIR,
    options: { detailed: boolean },
  ): string => {
    const children: RootContent[] = [md.heading(1, md.text(pkg.name))];

    if (pkg.description) {
      children.push(md.paragraph(md.text(pkg.description)));
    }

    // Summary statistics
    const allSymbols = pkg.modules.flatMap((m) => m.symbols);
    const funcCount = allSymbols.filter((s) => s.kind === "function").length;
    const typeCount = allSymbols.filter((s) => s.kind !== "function").length;

    children.push(
      md.heading(2, md.text("Overview")),
      md.list(
        false,
        md.listItem(
          md.paragraph(
            md.strong(md.text("Modules")),
            md.text(`: ${pkg.modules.length}`),
          ),
        ),
        md.listItem(
          md.paragraph(
            md.strong(md.text("Exported functions")),
            md.text(`: ${funcCount}`),
          ),
        ),
        md.listItem(
          md.paragraph(
            md.strong(md.text("Exported types")),
            md.text(`: ${typeCount}`),
          ),
        ),
      ),
    );

    // Group by directory
    const grouped = new Map<string, ModuleIR[]>();
    for (const mod of pkg.modules) {
      const dir = mod.relativePath.includes("/")
        ? mod.relativePath.slice(0, mod.relativePath.lastIndexOf("/"))
        : "(root)";
      const list = grouped.get(dir) ?? [];
      list.push(mod);
      grouped.set(dir, list);
    }

    // Function index section
    const funcSymbols = allSymbols.filter((s) => s.kind === "function");
    if (funcSymbols.length > 0) {
      children.push(md.heading(2, md.text("Function Index")));

      for (const [dir, modules] of [...grouped.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const funcs = modules.flatMap((m) =>
          m.symbols.filter((s) => s.kind === "function"),
        );
        if (funcs.length === 0) continue;

        children.push(md.heading(3, md.text(dir)));
        for (const sym of funcs) {
          children.push(...renderSymbolBlock(sym, options.detailed));
        }
      }
    }

    // Type index
    const typeSymbols = allSymbols.filter((s) => s.kind !== "function");
    if (typeSymbols.length > 0) {
      children.push(md.heading(2, md.text("Type Index")));
      children.push(
        md.list(
          false,
          ...typeSymbols.map((t) =>
            md.listItem(
              md.paragraph(
                md.inlineCode(t.name),
                md.text(
                  ` (${t.kind})${t.description ? ` — ${t.description.replace(/</g, "&lt;").replace(/>/g, "&gt;")}` : ""}`,
                ),
              ),
            ),
          ),
        ),
      );
    }

    const tree = md.root(...children);
    return processor.stringify(tree);
  };

  return { renderPackage };
};
