import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";
import type { JSONSchema, JSONType } from "@cat/shared/schema/json";

import type { IPluginService } from "@/services/service";

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
  /**
   * 可选：原始 payload（如 JWT claims），供自动注册流程使用
   */
  rawPayload?: JSONType;
};

export type HandlePreAuthContext = {
  identifier: string;
};

export type HandleLogoutContext = {
  sessionId: string;
};

export type AuthFlowType = "CREDENTIAL" | "REDIRECT" | "PASSKEY";

export type AutoRegisterResult = {
  email: string;
  name: string;
  accountMeta?: JSONType;
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

  getAuthFlowType(): AuthFlowType {
    return "CREDENTIAL";
  }

  /** 是否支持首次登录时自动注册 */
  supportsAutoRegister?(): boolean;

  /** 从外部身份信息推断用户注册数据 */
  handleAutoRegister?(
    authResult: AuthResult,
    rawPayload: JSONType,
  ): Promise<AutoRegisterResult>;

  getAuthFormSchema?(): JSONSchema;
  handlePreAuth?(ctx: HandlePreAuthContext): Promise<PreAuthResult>;
  handleLogout?(ctx: HandleLogoutContext): Promise<void>;
}
