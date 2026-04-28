import type { NotificationEvent } from "../../shared/types.js";
import type { NotificationChannel } from "../types.js";

export class IssueCommentChannel implements NotificationChannel {
  private readonly ghCreateComment: (
    issueNumber: number,
    body: string,
  ) => Promise<void>;

  constructor(
    ghCreateComment: (issueNumber: number, body: string) => Promise<void>,
  ) {
    this.ghCreateComment = ghCreateComment;
  }

  async send(event: NotificationEvent): Promise<void> {
    const formattedMessage = this.formatMessage(event);
    const issueNumber = this.extractIssueNumber(event);
    await this.ghCreateComment(issueNumber, formattedMessage);
  }

  private formatMessage(event: NotificationEvent): string {
    const header = "[auto-dev] ";
    switch (event.type) {
      case "waiting_decision":
        return `${header}Decision Required\n\n${event.message}`;
      case "phase_transition":
        return `${header}Phase Update\n\n${event.message}`;
      case "agent_summary":
        return `${header}Agent Summary\n\n${event.message}`;
      case "waiting_human":
        return `${header}Human Intervention Requested\n\n${event.message}`;
      case "validation_failed":
        return `${header}Validation Failed\n\n${event.message}`;
      case "workflow_completed":
        return `${header}Workflow Completed\n\n${event.message}`;
      case "workflow_failed":
        return `${header}Workflow Failed\n\n${event.message}`;
      case "pr_ready":
        return `${header}PR Ready for Review\n\n${event.message}`;
    }
  }

  private extractIssueNumber(event: NotificationEvent): number {
    return 0;
  }
}
