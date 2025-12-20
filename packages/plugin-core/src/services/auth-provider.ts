import type { JSONSchema, JSONType } from "@cat/shared/schema/json";
import type { IPluginService } from "@/registry/plugin-registry.ts";

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

export type MFAChallengeResult = {
  /**
   * 此获取挑战会话储存的额外元数据，将在验证阶段被作为参数传递给 verifyChallenge
   */
  meta: JSONType;
  /**
   * 获取挑战端点返回给客户端的挑战数据
   */
  passToClient: JSONType;
};

export type MFAVerifyResult = {
  isSuccess: boolean;
};

export interface AuthProvider extends IPluginService {
  getName: () => string;
  getIcon: () => string;
  handlePreAuth?: (identifier: string) => Promise<PreAuthResult>;
  getAuthFormSchema?: () => JSONSchema;
  handleAuth: (
    userId: string,
    identifier: string,
    gotFromClient: {
      urlSearchParams: unknown;
      formData?: unknown;
    },
    preAuthMeta: JSONType,
  ) => Promise<AuthResult>;
  handleLogout?: (sessionId: string) => Promise<void>;
  isAvailable: () => Promise<boolean>;
}

export interface MFAProvider extends IPluginService {
  generateChallenge: () => Promise<MFAChallengeResult>;
  getVerfifyChallengeFormSchema?: () => JSONSchema;
  verifyChallenge: (
    gotFromClient: {
      formData?: unknown;
    },
    generateChallengeMeta: JSONType,
  ) => Promise<MFAVerifyResult>;
}
