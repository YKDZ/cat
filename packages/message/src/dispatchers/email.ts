import type { ChannelDispatcher, MessageRequest } from "@/types";

/**
 * Email provider interface implemented by plugins.
 */
export interface EmailProvider {
  getId(): string;
  getType(): "EMAIL_PROVIDER";
  sendEmail(options: {
    to: string;
    subject: string;
    body: string;
    html?: string;
  }): Promise<void>;
}

/**
 * Email dispatcher — delegates to EMAIL_PROVIDER plugin. Silently skips if none registered.
 */
export class EmailDispatcher implements ChannelDispatcher {
  readonly channel = "EMAIL" as const;
  private readonly getProvider: () => EmailProvider | undefined;
  private readonly resolveEmail: (userId: string) => Promise<string | null>;
  constructor(
    getProvider: () => EmailProvider | undefined,
    resolveEmail: (userId: string) => Promise<string | null>,
  ) {
    this.getProvider = getProvider;
    this.resolveEmail = resolveEmail;
  }

  async dispatch(request: MessageRequest): Promise<void> {
    const provider = this.getProvider();
    if (!provider) return;
    const email = await this.resolveEmail(request.recipientId);
    if (!email) return;
    await provider.sendEmail({
      to: email,
      subject: request.title,
      body: request.body,
    });
  }
}
