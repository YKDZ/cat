import type { IPluginService } from "@/services/service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";
import type {
  JSONSchema,
  JSONType,
  NonNullJSONType,
} from "@cat/shared/schema/json";
import type { MFAProvider as MFAProviderDB } from "@cat/shared/schema/drizzle/user";

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

export type VerifyChallengeContext = {
  gotFromClient: {
    formData?: unknown;
  };
  generateChallengeMeta: JSONType;
  mfaProvider: MFAProviderDB;
};

export type MFAVerifyResult = {
  isSuccess: boolean;
};

export type MFAPreInitForUserContext = {
  userId: string;
};

export type MFAInitForUserContext = {
  userId: string;
  preInitPayload: NonNullJSONType;
  gotFromClient: JSONType;
};

export type MFAPreInitForUserResult = {
  payload: NonNullJSONType;
};

export type MFAInitForUserResult = {
  isSuccess: boolean;
  payload?: NonNullJSONType;
};

export abstract class MFAProvider implements IPluginService {
  abstract getId(): string;

  getType(): PluginServiceType {
    return "MFA_PROVIDER";
  }

  abstract verifyChallenge(
    ctx: VerifyChallengeContext,
  ): Promise<MFAVerifyResult>;

  preInitForUser?(
    ctx: MFAPreInitForUserContext,
  ): Promise<MFAPreInitForUserResult>;
  initForUser?(ctx: MFAInitForUserContext): Promise<MFAInitForUserResult>;
  generateChallenge?(): Promise<MFAChallengeResult>;
  getVerifyChallengeFormSchema?(): JSONSchema;
}
