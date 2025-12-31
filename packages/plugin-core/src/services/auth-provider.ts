import type { JSONSchema, JSONType } from "@cat/shared/schema/json";
import type { IPluginService } from "@/services/service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

export type PreAuthResult = {
  /**
   * 此预登录会话储存的额外元数据，将在 auth 阶段被作为参数传递给 handleAuth
   */
  meta: JSONType;
  /**
   * 预登录端点返回给客户端的数据
   */
  passToClient: JSONType;
};

export type AuthResult = {
  providerIssuer: string;
  providedAccountId: string;
  /**
   * 若创建新 Account，则在其中储存的额外元数据
   */
  accountMeta?: JSONType;
};

export type HandlePreAuthContext = {
  identifier: string;
};

export type HandleLogoutContext = {
  sessionId: string;
};

export abstract class AuthProvider implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "AUTH_PROVIDER";
  }
  abstract getName(): string;
  abstract getIcon(): string;
  abstract handleAuth(
    userId: string,
    identifier: string,
    gotFromClient: {
      urlSearchParams: unknown;
      formData?: unknown;
    },
    preAuthMeta: JSONType,
  ): Promise<AuthResult>;
  abstract isAvailable(): Promise<boolean>;

  getAuthFormSchema?(): JSONSchema;
  handlePreAuth?(ctx: HandlePreAuthContext): Promise<PreAuthResult>;
  handleLogout?(ctx: HandleLogoutContext): Promise<void>;
}
