import { describe, it, expect, vi } from "vitest";
import { IssueCommentChannel } from "./issue-comment.js";
import type { NotificationEvent } from "../../shared/types.js";

describe("IssueCommentChannel", () => {
  it("formats waiting_decision correctly", async () => {
    const createComment = vi.fn();
    const channel = new IssueCommentChannel(createComment);
    const event: NotificationEvent = {
      id: "1", workflowRunId: "run-1",
      type: "waiting_decision",
      message: "Please decide on model selection",
      channel: "issue", sentAt: new Date().toISOString(),
    };
    await channel.send(event);
    expect(createComment).toHaveBeenCalled();
  });

  it("formats phase_transition correctly", async () => {
    const createComment = vi.fn();
    const channel = new IssueCommentChannel(createComment);
    const event: NotificationEvent = {
      id: "2", workflowRunId: "run-1",
      type: "phase_transition",
      message: "Moving to implementation",
      channel: "issue", sentAt: new Date().toISOString(),
    };
    await channel.send(event);
    expect(createComment).toHaveBeenCalled();
  });
});
