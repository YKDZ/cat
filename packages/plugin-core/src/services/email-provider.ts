import type { IPluginService } from "@/services/service";

/**
 * @zh 邮件发送提供商插件服务基类。
 * @en Base class for the EMAIL_PROVIDER plugin service.
 */
export abstract class EmailProviderService implements IPluginService {
  abstract getId(): string;

  getType(): "EMAIL_PROVIDER" {
    return "EMAIL_PROVIDER";
  }

  abstract sendEmail(options: {
    to: string;
    subject: string;
    body: string;
    html?: string;
  }): Promise<void>;
}
