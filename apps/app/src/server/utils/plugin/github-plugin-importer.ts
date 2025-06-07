import type { PluginData } from "@cat/shared";
import { Octokit } from "octokit";
import { z } from "zod/v4";
import type { PluginImporter } from "./plugin-importer-registry";
import { tarGZURLImporter } from "./tar-gz-url-plugin-importer";

const OriginSchema = z.object({
  type: z.literal("GITHUB"),
  data: z.object({
    owner: z.string(),
    repo: z.string(),
    ref: z.string().optional(),
  }),
});

const octokit = new Octokit({
  auth: "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",
});

class GitHubPluginImporter implements PluginImporter {
  getOriginName(): string {
    return "GITHUB";
  }

  canImportPlugin(origin: Record<string, unknown>): boolean {
    try {
      OriginSchema.parse(origin);
      return true;
    } catch {
      return false;
    }
  }

  async importPlugin(origin: Record<string, unknown>): Promise<PluginData> {
    const {
      data: { owner, repo, ref },
    } = OriginSchema.parse(origin);

    if (!owner || !repo || !ref)
      throw new Error("Key: " + origin + " has wrong format");

    const { url } = await octokit.request(
      "GET /repos/{owner}/{repo}/tarball/{ref}",
      {
        owner,
        repo,
        ref,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    return tarGZURLImporter.importPlugin({
      type: "TAR_GZ_URL",
      data: {
        url,
      },
    });
  }
}

export const githubPluginImporter = new GitHubPluginImporter();
