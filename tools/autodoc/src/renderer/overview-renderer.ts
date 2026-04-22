import type { RootContent } from "mdast";

import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import type { PackageIR } from "../ir.js";
import type { AutodocConfig } from "../types.js";

import { getPackageDocHref } from "../package-doc-path.js";
import * as md from "./mdast-builder.js";

export const createOverviewRenderer = (
  config: AutodocConfig,
): { render: (packages: PackageIR[]) => string } => {
  const render = (packages: PackageIR[]): string => {
    const processor = unified().use(remarkStringify).use(remarkGfm);
    const fallbackTitle = config.project?.name
      ? `${config.project.name} Overview`
      : "Workspace Overview";
    const title = config.overview?.title ?? fallbackTitle;
    const sections = config.overview?.sections.length
      ? config.overview.sections
      : [
          {
            type: "packages" as const,
            heading: "Packages",
            priorities: ["high", "medium", "low"] as Array<
              "high" | "medium" | "low"
            >,
          },
        ];

    const children: RootContent[] = [md.heading(1, md.text(title))];

    for (const section of sections) {
      children.push(md.heading(2, md.text(section.heading)));

      if (section.type === "links") {
        children.push(
          md.list(
            false,
            ...section.items.map((item) =>
              md.listItem(
                md.paragraph(
                  item.href
                    ? md.link(item.href, md.strong(md.text(item.label)))
                    : md.strong(md.text(item.label)),
                  md.text(` — ${item.description}`),
                ),
              ),
            ),
          ),
        );
        continue;
      }

      if (section.type === "packages") {
        const allowed = new Set(
          section.priorities ?? ["high", "medium", "low"],
        );
        const filtered = packages.filter((pkg) => allowed.has(pkg.priority));

        children.push(
          md.list(
            false,
            ...filtered.map((pkg) => {
              const funcCount = pkg.modules.reduce(
                (sum, mod) =>
                  sum +
                  mod.symbols.filter((symbol) => symbol.kind === "function")
                    .length,
                0,
              );
              const typeCount = pkg.modules.reduce(
                (sum, mod) =>
                  sum +
                  mod.symbols.filter((symbol) => symbol.kind !== "function")
                    .length,
                0,
              );

              return md.listItem(
                md.paragraph(
                  md.link(
                    getPackageDocHref(pkg.name, config.packageDocs ?? {}),
                    md.strong(md.text(pkg.name)),
                  ),
                  md.text(
                    `${pkg.description ? ` — ${pkg.description}` : ""} (${funcCount} functions, ${typeCount} types)`,
                  ),
                ),
              );
            }),
          ),
        );
        continue;
      }

      children.push(md.code(section.language ?? "", section.content));
    }

    return processor.stringify(md.root(...children));
  };

  return { render };
};
