import type { ChannelDispatcher, MessageRequest } from "@/types";

/**
 * @zh 邮件提供商接口（由插件实现）。
 * @en Email provider interface implemented by plugins.
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
 * @zh 邮件分发器 — 委托给 EMAIL_PROVIDER 插件服务。无提供商时静默跳过。
 * @en Email dispatcher — delegates to EMAIL_PROVIDER plugin. Silently skips if none registered.
 */
export class EmailDispatcher implements ChannelDispatcher {
  readonly channel = "EMAIL" as const;
  constructor(
    private readonly getProvider: () => EmailProvider | undefined,
    private readonly resolveEmail: (userId: string) => Promise<string | null>,
  ) {}

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
