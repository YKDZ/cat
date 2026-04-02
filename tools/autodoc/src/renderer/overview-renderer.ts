import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import type { PackageIR } from "../ir.js";
import type { AutodocConfig } from "../types.js";

import * as md from "./mdast-builder.js";

export const createOverviewRenderer = (
  _config: AutodocConfig,
): { render: (packages: PackageIR[]) => string } => {
  const render = (packages: PackageIR[]): string => {
    const processor = unified().use(remarkStringify).use(remarkGfm);

    const children = [
      md.heading(1, md.text("CAT Project Module Overview")),

      // Apps section (static)
      md.heading(2, md.text("Apps")),
      md.list(
        false,
        md.listItem(
          md.paragraph(
            md.strong(md.text("@cat/app")),
            md.text(" — apps/app — Main app (Vue 3 SSR + Vike)"),
          ),
        ),
        md.listItem(
          md.paragraph(
            md.strong(md.text("@cat/app-api")),
            md.text(" — apps/app-api — API layer (Hono + oRPC)"),
          ),
        ),
        md.listItem(
          md.paragraph(
            md.strong(md.text("@cat/docs")),
            md.text(" — apps/docs — Documentation site (VitePress)"),
          ),
        ),
      ),

      // Core Packages section (dynamic)
      md.heading(2, md.text("Core Packages")),
      md.list(
        false,
        ...packages.map((pkg) => {
          const funcCount = pkg.modules.reduce(
            (sum, m) =>
              sum + m.symbols.filter((s) => s.kind === "function").length,
            0,
          );
          const typeCount = pkg.modules.reduce(
            (sum, m) =>
              sum + m.symbols.filter((s) => s.kind !== "function").length,
            0,
          );
          const shortName = pkg.name.replace("@cat/", "");
          const desc = pkg.description ? ` — ${pkg.description}` : "";
          return md.listItem(
            md.paragraph(
              md.link(
                `./packages/${shortName}.md`,
                md.strong(md.text(pkg.name)),
              ),
              md.text(`${desc} (${funcCount} functions, ${typeCount} types)`),
            ),
          );
        }),
      ),

      // Dependency graph
      md.heading(2, md.text("Core Package Dependencies")),
      md.code(
        "",
        "operations → domain → db → shared\npermissions → db → shared\nagent → operations → domain",
      ),
    ];

    const tree = md.root(...children);
    return processor.stringify(tree);
  };

  return { render };
};
