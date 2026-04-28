import { describe, it, expect, vi } from "vitest";
import { pollIssues } from "./issue-poller.js";
import { DEFAULT_CONFIG } from "../config/types.js";

vi.mock("../shared/gh-cli.js", () => ({
  listIssues: vi.fn(),
}));

import { listIssues } from "../shared/gh-cli.js";

describe("pollIssues", () => {
  it("returns empty array when gh CLI errors", async () => {
    vi.mocked(listIssues).mockImplementation(() => {
      throw new Error("Network error");
    });

    const results = await pollIssues("owner/repo", DEFAULT_CONFIG, "/tmp/test");
    expect(results).toEqual([]);
  });

  it("filters out human-only issues", async () => {
    vi.mocked(listIssues).mockReturnValue([
      { number: 1, title: "Issue 1", labels: [{ name: "auto-dev:ready" }, { name: "human-only" }], body: "body" },
    ]);

    const results = await pollIssues("owner/repo", DEFAULT_CONFIG, "/tmp/test");
    expect(results).toHaveLength(0);
  });
});
